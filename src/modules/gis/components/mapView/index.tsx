import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import GeoJSON from 'ol/format/GeoJSON';
import { fromLonLat, toLonLat } from 'ol/proj';
import Select from 'ol/interaction/Select';
import Modify from 'ol/interaction/Modify';
import Draw from 'ol/interaction/Draw';
import Snap from 'ol/interaction/Snap';
import { click, always } from 'ol/events/condition';
import Style from 'ol/style/Style';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import CircleStyle from 'ol/style/Circle';
import OLFeature from 'ol/Feature';
import type { Geometry } from 'ol/geom';
import * as turf from '@turf/turf';
import type { Feature as GJFeature, LineString as GJLineString, Polygon as GJPolygon, MultiPolygon as GJMultiPolygon, MultiLineString as GJMultiLineString } from 'geojson';
import { v4 as uuidv4 } from 'uuid';
import 'ol/ol.css';

import { getFeaturesService } from '@/common/libs/services/gisFeaturesService';
import { openNotification } from '@/common/components/shared/notification';
import type { MapViewProps, MapViewRef, GisFeatureInfo, GeoJSONFeature, GeoJSONFeatureProperties, SpatialRelationship } from '@/modules/gis/types';

// Şağan / Buzovna, Xəzər district, Baku
const BAKU_CENTER = fromLonLat([50.1108, 40.4834]);
const DEFAULT_COLOR = '#3388ff';
type GeometryFamily = 'line' | 'polygon' | 'unsupported';
type PolygonFeature = GJFeature<GJPolygon | GJMultiPolygon>;
type LineFeature = GJFeature<GJLineString | GJMultiLineString>;

const getGeometryFamily = (geometryType?: string): GeometryFamily => {
  if (geometryType === 'LineString' || geometryType === 'MultiLineString') return 'line';
  if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') return 'polygon';
  return 'unsupported';
};

const isPolygonFeature = (feature: GJFeature): feature is PolygonFeature =>
  getGeometryFamily(feature.geometry?.type) === 'polygon';

const isLineFeature = (feature: GJFeature): feature is LineFeature =>
  getGeometryFamily(feature.geometry?.type) === 'line';

// ─── JTS-inspired polygon union ───────────────────────────────────────────────
// GeoServer uses JTS CascadedPolygonUnion + GeometrySnapper + PrecisionModel.
// We replicate that pipeline in three stages:
//   Stage 1 – PrecisionModel snap: round coords to a fixed decimal grid so
//             polygon-clipping sees identical shared-boundary vertices.
//   Stage 2 – GeometrySnapper: snap each polygon's vertices to the nearest
//             vertex in the other polygons within a degree-space tolerance.
//   Stage 3 – buffer(0) self-repair + final union fallback.

const snapRingToPrecision = (ring: number[][], factor: number): number[][] =>
  ring.map((c) => c.map((v) => Math.round(v * factor) / factor));

const snapGeomToPrecision = (
  geom: GJPolygon | GJMultiPolygon,
  factor: number,
): GJPolygon | GJMultiPolygon => {
  if (geom.type === 'Polygon') {
    return { type: 'Polygon', coordinates: geom.coordinates.map((r) => snapRingToPrecision(r, factor)) };
  }
  return {
    type: 'MultiPolygon',
    coordinates: geom.coordinates.map((poly) => poly.map((r) => snapRingToPrecision(r, factor))),
  };
};

const collectRingsCoords = (features: PolygonFeature[]): number[][] => {
  const pts: number[][] = [];
  for (const f of features) {
    const geom = f.geometry;
    const rings: number[][][] =
      geom.type === 'Polygon'
        ? geom.coordinates
        : geom.coordinates.flat(1);
    for (const ring of rings) for (const c of ring) pts.push(c);
  }
  return pts;
};

// JTS GeometrySnapper equivalent: for every vertex of `target` find the closest
// vertex in `otherCoords`; if it is within `tolDeg` degrees snap to it.
const snapRingToVertices = (ring: number[][], otherCoords: number[][], tolDeg: number): number[][] =>
  ring.map((c) => {
    let best = Infinity;
    let snap = c;
    for (const o of otherCoords) {
      const d = Math.sqrt((c[0] - o[0]) ** 2 + (c[1] - o[1]) ** 2);
      if (d < best && d <= tolDeg) { best = d; snap = o; }
    }
    return snap;
  });

const snapGeomToVertices = (
  geom: GJPolygon | GJMultiPolygon,
  otherCoords: number[][],
  tolDeg: number,
): GJPolygon | GJMultiPolygon => {
  if (geom.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geom.coordinates.map((r) => snapRingToVertices(r, otherCoords, tolDeg)),
    };
  }
  return {
    type: 'MultiPolygon',
    coordinates: geom.coordinates.map((poly) =>
      poly.map((r) => snapRingToVertices(r, otherCoords, tolDeg)),
    ),
  };
};

const tryUnion = (features: PolygonFeature[]): PolygonFeature | null => {
  try {
    return turf.union(turf.featureCollection(features)) as PolygonFeature | null;
  } catch {
    return null;
  }
};

// Degree-space tolerance levels that mirror JTS PrecisionModel scale factors.
// 1e-7 deg ≈ 1.1 cm; 1e-6 deg ≈ 11 cm; 1e-5 deg ≈ 1.1 m.
const PRECISION_SCALES = [1e7, 1e6, 1e5];
// GeometrySnapper tolerance levels (degrees)
const SNAP_TOLERANCES_DEG = [1e-7, 1e-6, 1e-5];

// ─── Stage 4: cascade gap-bridge ──────────────────────────────────────────────
// Strategy: try progressively larger buffer radii R until the buffered polygons
// overlap and union into a single Polygon, then deflate by the same R to
// restore the original outer boundary while keeping the gap filled.
//
// Why cascade instead of measuring the gap first:
//   – vertex-to-vertex distance overestimates the true gap when the nearest
//     boundary points lie on polygon edges rather than at vertices.
//   – Starting small avoids excessive shape distortion; the first R that
//     bridges the gap is used.
//
// 1-D proof that buffer(R) → union → buffer(-R) fills the gap:
//   A:[0,10]  B:[15,25]  gap=5m  R=3m (> gap/2=2.5m)
//   A':[-3,13]  B':[12,28]  overlap 1m → union:[-3,28]
//   buffer(-3) → [0,25]  ← outer edges match originals, gap 10..15 is filled ✓

const bridgeGapAndUnion = (polyFeatures: PolygonFeature[]): PolygonFeature | null => {
  // Candidate radii in metres.  The first one that produces a single Polygon
  // union is used; we stop at 500 m to avoid merging genuinely distant parcels.
  const candidates = [0.5, 1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500];

  for (const bufAmt of candidates) {
    try {
      const buffered = polyFeatures
        .map((f) => turf.buffer(f, bufAmt, { units: 'meters' }))
        .filter((f): f is PolygonFeature => Boolean(f) && isPolygonFeature(f as GJFeature));

      if (buffered.length < 2) continue;

      const merged = tryUnion(buffered);
      if (merged?.geometry.type !== 'Polygon') continue;

      // Deflate by the same radius.  The former gap area is "deep enough" to
      // survive because both originals contributed their radius into it
      // (net width through gap = 2R − gap > 0 when R > gap/2).
      const restored = turf.buffer(merged, -bufAmt, { units: 'meters' });
      if (restored && isPolygonFeature(restored as GJFeature)) return restored as PolygonFeature;

      // Deflation failed (very thin polygon) – return the expanded version so
      // the merge still produces a single feature rather than MultiPolygon.
      return merged;
    } catch (err) {
      console.error(`Stage 4 bridge R=${bufAmt}m failed:`, err);
    }
  }

  return null;
};

const unionPolygonFeatures = (polyFeatures: PolygonFeature[]): PolygonFeature | null => {
  // Stage 1 – exact union (no snapping)
  const exact = tryUnion(polyFeatures);
  if (exact?.geometry.type === 'Polygon') return exact;

  // Stage 2a – PrecisionModel: snap every coord to grid, coarser with each try
  for (const scale of PRECISION_SCALES) {
    const snapped = polyFeatures.map((f) => ({
      ...f,
      geometry: snapGeomToPrecision(f.geometry, scale),
    })) as PolygonFeature[];
    const result = tryUnion(snapped);
    if (result?.geometry.type === 'Polygon') return result;
  }

  // Stage 2b – GeometrySnapper: snap each polygon's vertices onto the other polygons' vertices
  for (const tolDeg of SNAP_TOLERANCES_DEG) {
    const snapped = polyFeatures.map((f, idx) => {
      const others = polyFeatures.filter((_, i) => i !== idx);
      const otherCoords = collectRingsCoords(others);
      return { ...f, geometry: snapGeomToVertices(f.geometry, otherCoords, tolDeg) } as PolygonFeature;
    });
    const result = tryUnion(snapped);
    if (result?.geometry.type === 'Polygon') return result;
  }

  // Stage 3 – buffer(0) self-repair then union (JTS validity normalisation)
  const repaired = polyFeatures
    .map((f) => turf.buffer(f, 0))
    .filter((f): f is PolygonFeature => Boolean(f) && isPolygonFeature(f as GJFeature));
  if (repaired.length >= 2) {
    const result = tryUnion(repaired);
    if (result?.geometry.type === 'Polygon') return result;
  }

  // Stage 4 – real-gap bridge: measure the gap and close it with buffer+union+deflate.
  // Handles cases where polygons are genuinely separated (road, corridor, etc.).
  const bridged = bridgeGapAndUnion(polyFeatures);
  if (bridged?.geometry.type === 'Polygon') return bridged;

  // All stages exhausted — polygons are too far apart or non-polygon input.
  // Return MultiPolygon so the merge still succeeds as a multipart feature.
  return exact;
};

const hexToRgba = (hex: string, alpha: number): string => {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const makeFeatureStyle = (color: string, isSelected: boolean): Style => {
  if (isSelected) {
    return new Style({
      fill: new Fill({ color: hexToRgba(color, 0.75) }),
      stroke: new Stroke({ color: '#ff6600', width: 3 }),
      image: new CircleStyle({
        radius: 6,
        fill: new Fill({ color: '#ff6600' }),
        stroke: new Stroke({ color: '#fff', width: 1.5 }),
      }),
    });
  }
  return new Style({
    fill: new Fill({ color: hexToRgba(color, 0.6) }),
    stroke: new Stroke({ color, width: 2 }),
    image: new CircleStyle({
      radius: 5,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: '#fff', width: 1 }),
    }),
  });
};

const drawStyle = new Style({
  fill: new Fill({ color: 'rgba(51, 136, 255, 0.15)' }),
  stroke: new Stroke({ color: '#3388ff', width: 2, lineDash: [6, 3] }),
  image: new CircleStyle({
    radius: 5,
    fill: new Fill({ color: '#3388ff' }),
    stroke: new Stroke({ color: '#fff', width: 1 }),
  }),
});

const cutLineStyle = new Style({
  stroke: new Stroke({ color: '#ff0000', width: 2, lineDash: [8, 4] }),
});

export type { MapViewRef };

const MapView = forwardRef<MapViewRef, MapViewProps>(({ activeTool, onSelectionChange, onCoordinateChange, onFeatureDrawn }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const vectorSourceRef = useRef<VectorSource<OLFeature<Geometry>> | null>(null);
  const vectorLayerRef = useRef<VectorLayer<VectorSource<OLFeature<Geometry>>> | null>(null);
  const selectedIdsRef = useRef<Set<string>>(new Set());
  // IDs of features that were removed by cut/merge and must be deleted from the
  // backend on the next save (drawing new pieces with fresh uuids is not enough —
  // the original rows would otherwise linger and reappear after a reload).
  const removedIdsRef = useRef<Set<string>>(new Set());

  const singleSelectRef = useRef<Select | null>(null);
  const multiSelectRef = useRef<Select | null>(null);
  const modifyRef = useRef<Modify | null>(null);
  const snapRef = useRef<Snap | null>(null);
  const drawCutRef = useRef<Draw | null>(null);
  const drawNewRef = useRef<Draw | null>(null);
  const tempSourceRef = useRef<VectorSource<OLFeature<Geometry>> | null>(null);

  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;

  const refreshStyles = useCallback(() => {
    vectorLayerRef.current?.changed();
  }, []);

  const updateSelection = useCallback((ids: Set<string>) => {
    selectedIdsRef.current = ids;
    refreshStyles();
    onSelectionChange(ids.size);
  }, [onSelectionChange, refreshStyles]);

  // ─── Init map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const vectorSource = new VectorSource<OLFeature<Geometry>>();
    vectorSourceRef.current = vectorSource;

    const vectorLayer = new VectorLayer({
      source: vectorSource,
      style: (feature) => {
        const id = feature.getId() as string | undefined;
        const isSelected = id ? selectedIdsRef.current.has(id) : false;
        const color = (feature as OLFeature<Geometry>).get('color') || DEFAULT_COLOR;
        return makeFeatureStyle(color, isSelected);
      },
    });
    vectorLayerRef.current = vectorLayer;

    const tempSource = new VectorSource<OLFeature<Geometry>>();
    tempSourceRef.current = tempSource;
    const tempLayer = new VectorLayer({ source: tempSource, zIndex: 10 });

    const map = new Map({
      target: containerRef.current,
      layers: [
        new TileLayer({ source: new OSM() }),
        vectorLayer,
        tempLayer,
      ],
      view: new View({
        center: BAKU_CENTER,
        zoom: 14,
      }),
    });
    mapRef.current = map;

    // ─── Coordinate tracking ──────────────────────────────────────────────────
    if (onCoordinateChange) {
      map.on('pointermove', (e) => {
        const lonLat = toLonLat(e.coordinate);
        onCoordinateChange([lonLat[0], lonLat[1]]);
      });
      const container = containerRef.current;
      const handleLeave = () => onCoordinateChange(null);
      container?.addEventListener('mouseleave', handleLeave);
    }

    // ─── Single Select ────────────────────────────────────────────────────────
    const singleSelect = new Select({
      condition: click,
      layers: [vectorLayer],
      style: [],
    });
    singleSelect.on('select', (e) => {
      if (activeToolRef.current !== 'select' && activeToolRef.current !== 'edit') return;
      const newSet = new Set<string>();
      e.target.getFeatures().forEach((f: OLFeature<Geometry>) => {
        const id = (f.getId() as string) || (f.get('id') as string);
        if (id) newSet.add(id);
      });
      updateSelection(newSet);
    });
    singleSelectRef.current = singleSelect;

    // ─── Multi Select (merge tool) ────────────────────────────────────────────
    const multiSelect = new Select({
      condition: click,
      toggleCondition: always,
      layers: [vectorLayer],
      style: [],
    });
    multiSelect.on('select', () => {
      if (activeToolRef.current !== 'merge') return;
      const newSet = new Set<string>();
      multiSelect.getFeatures().forEach((f: OLFeature<Geometry>) => {
        const id = (f.getId() as string) || (f.get('id') as string);
        if (id) newSet.add(id);
      });
      updateSelection(newSet);
    });
    multiSelectRef.current = multiSelect;

    // ─── Modify (vertex editing) ──────────────────────────────────────────────
    const modify = new Modify({ source: vectorSource });
    modifyRef.current = modify;

    // ─── Snap (so adjacent polygons can share exact borders) ──────────────────
    // Must be added to the map AFTER any Draw/Modify interaction to take effect.
    const snap = new Snap({ source: vectorSource });
    snapRef.current = snap;

    // ─── Draw cut line ────────────────────────────────────────────────────────
    const drawCut = new Draw({
      source: tempSource,
      type: 'LineString',
      style: cutLineStyle,
    });
    drawCut.on('drawend', (e) => {
      const line = e.feature;
      // OL adds the feature to source AFTER drawend fires — clear after
      setTimeout(() => tempSource.clear(), 0);
      performCut(line as OLFeature<Geometry>);
    });
    drawCutRef.current = drawCut;

    loadFeatures();

    return () => {
      map.setTarget(undefined);
    };
  }, []);

  // ─── Switch active tool ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    [
      singleSelectRef.current,
      multiSelectRef.current,
      modifyRef.current,
      snapRef.current,
      drawCutRef.current,
      drawNewRef.current,
    ].forEach((interaction) => {
      if (interaction) map.removeInteraction(interaction);
    });
    drawNewRef.current = null;

    singleSelectRef.current?.getFeatures().clear();
    multiSelectRef.current?.getFeatures().clear();
    updateSelection(new Set());

    // Snap has to be (re)added LAST, after Draw/Modify, so it can intercept their pointer events.
    const enableSnap = () => {
      if (snapRef.current) map.addInteraction(snapRef.current);
    };

    switch (activeTool) {
      case 'select':
        if (singleSelectRef.current) map.addInteraction(singleSelectRef.current);
        break;
      case 'merge':
        if (multiSelectRef.current) map.addInteraction(multiSelectRef.current);
        break;
      case 'edit':
        if (singleSelectRef.current) map.addInteraction(singleSelectRef.current);
        if (modifyRef.current) map.addInteraction(modifyRef.current);
        enableSnap();
        break;
      case 'cut':
        if (drawCutRef.current) map.addInteraction(drawCutRef.current);
        enableSnap();
        break;
      case 'drawPolygon':
        setupDrawNew(map, 'Polygon');
        enableSnap();
        break;
      case 'drawLine':
        setupDrawNew(map, 'LineString');
        enableSnap();
        break;
      case 'drawPoint':
        setupDrawNew(map, 'Point');
        enableSnap();
        break;
    }
  }, [activeTool]);

  const setupDrawNew = (map: Map, type: 'Polygon' | 'LineString' | 'Point') => {
    const vectorSource = vectorSourceRef.current;
    if (!vectorSource) return;

    const draw = new Draw({
      source: vectorSource,
      type,
      style: drawStyle,
    });

    draw.on('drawend', (e) => {
      const feature = e.feature as OLFeature<Geometry>;
      const newId = uuidv4();
      feature.setId(newId);
      feature.set('id', newId);
      feature.set('color', DEFAULT_COLOR);
      feature.set('name', null);
      feature.set('featureType', null);

      onFeatureDrawn?.();
    });

    drawNewRef.current = draw;
    map.addInteraction(draw);
  };

  // ─── Load features from backend ───────────────────────────────────────────
  const loadFeatures = async () => {
    try {
      const featureCollection = await getFeaturesService();
      if (!featureCollection?.features?.length) return;

      const format = new GeoJSON();
      const features = format.readFeatures(featureCollection, {
        featureProjection: 'EPSG:3857',
        dataProjection: 'EPSG:4326',
      });

      features.forEach((f) => {
        const id = (f as OLFeature<Geometry>).get('id');
        if (id) (f as OLFeature<Geometry>).setId(id);
      });

      vectorSourceRef.current?.addFeatures(features as OLFeature<Geometry>[]);
    } catch (err) {
      console.error('Error loading features:', err);
    }
  };

  // ─── Cut polygon logic ────────────────────────────────────────────────────
  const performCut = (lineFeature: OLFeature<Geometry>) => {
    const vectorSource = vectorSourceRef.current;
    if (!vectorSource) return;

    const format = new GeoJSON();
    const lineGeoJSON = format.writeFeatureObject(lineFeature, {
      featureProjection: 'EPSG:3857',
      dataProjection: 'EPSG:4326',
    });

    const line = lineGeoJSON as unknown as GJFeature<GJLineString>;
    let cutPerformed = false;

    for (const feature of vectorSource.getFeatures()) {
      const featureGeoJSON = format.writeFeatureObject(feature, {
        featureProjection: 'EPSG:3857',
        dataProjection: 'EPSG:4326',
      });

      try {
        if (
          featureGeoJSON.geometry?.type !== 'Polygon' &&
          featureGeoJSON.geometry?.type !== 'MultiPolygon'
        ) continue;

        const polygon = featureGeoJSON as unknown as GJFeature<GJPolygon | GJMultiPolygon>;
        if (!turf.booleanIntersects(line, polygon)) continue;

        const result = cutPolygonWithLine(polygon, line);
        if (!result) continue;

        const [part1, part2] = result;

        const parentColor = feature.get('color') || DEFAULT_COLOR;
        const parentName = feature.get('name') ?? null;
        const parentFeatureType = feature.get('featureType') ?? null;

        const parentId = (feature.getId() as string) || (feature.get('id') as string);
        if (parentId) removedIdsRef.current.add(parentId);
        vectorSource.removeFeature(feature);

        [part1, part2].forEach((part) => {
          const newId = uuidv4();
          const rawFeature = format.readFeature(
            {
              ...part,
              properties: {
                id: newId,
                color: parentColor,
                name: parentName,
                featureType: parentFeatureType,
              },
            },
            { featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' }
          );
          const newFeature = (Array.isArray(rawFeature) ? rawFeature[0] : rawFeature) as OLFeature<Geometry>;
          newFeature.setId(newId);
          newFeature.set('color', parentColor);
          newFeature.set('name', parentName);
          newFeature.set('featureType', parentFeatureType);
          vectorSource.addFeature(newFeature);
        });

        openNotification({
          type: 'success',
          title: 'Kəsmə',
          content: 'Polygon uğurla iki hissəyə bölündü.',
        });

        cutPerformed = true;
        break;
      } catch (err) {
        console.error('Cut operation error:', err);
      }
    }

    if (!cutPerformed) {
      openNotification({
        type: 'warning',
        title: 'Kəsmə',
        content: 'Xətt heç bir polygon ilə kəsişmir.',
      });
    }
  };

  const cutPolygonWithLine = (
    polygon: GJFeature<GJPolygon | GJMultiPolygon>,
    line: GJFeature<GJLineString>
  ): [GJFeature, GJFeature] | null => {
    const bb = turf.bbox(polygon);
    const diagonal = Math.sqrt(Math.pow(bb[2] - bb[0], 2) + Math.pow(bb[3] - bb[1], 2));
    const ext = Math.max(diagonal * 5, 0.01);

    const coords = line.geometry.coordinates;
    const start = coords[0];
    const end = coords[coords.length - 1];

    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const len = Math.sqrt(dx * dx + dy * dy) || 0.0001;
    const ux = dx / len;
    const uy = dy / len;

    const extStart: [number, number] = [start[0] - ux * ext, start[1] - uy * ext];
    const extEnd: [number, number] = [end[0] + ux * ext, end[1] + uy * ext];

    const nx = -uy;
    const ny = ux;
    const big = ext * 4;

    const leftHalf = turf.polygon([[
      extStart,
      extEnd,
      [extEnd[0] + nx * big, extEnd[1] + ny * big],
      [extStart[0] + nx * big, extStart[1] + ny * big],
      extStart,
    ]]);

    const part1 = turf.intersect(turf.featureCollection([polygon, leftHalf]));
    if (!part1) {
      console.error('cutPolygonWithLine: intersect returned null (leftHalf does not overlap polygon)');
      return null;
    }

    const part2 = turf.difference(turf.featureCollection([polygon, part1]));
    if (!part2) {
      console.error('cutPolygonWithLine: difference returned null (line does not split polygon into two parts — try crossing both edges)');
      return null;
    }

    return [part1 as GJFeature, part2 as GJFeature];
  };

  // ─── Imperative API ───────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    confirmMerge: (targetFeatureId: string) => {
      const vectorSource = vectorSourceRef.current;
      if (!vectorSource) return;

      const selectedIds = Array.from(selectedIdsRef.current);
      const format = new GeoJSON();
      const findById = (id: string) =>
        (vectorSource.getFeatureById(id) as OLFeature<Geometry> | null) ??
        vectorSource.getFeatures().find((f) => f.get('id') === id) ??
        null;

      const features = selectedIds.map(findById).filter(Boolean) as OLFeature<Geometry>[];

      if (features.length < 2) {
        openNotification({
          type: 'warning',
          title: 'Birləşdirmə',
          content: 'Birləşdirmək üçün ən azı iki obyekt seçilməlidir',
        });
        return;
      }

      const geoJSONFeatures = features.map((f) =>
        format.writeFeatureObject(f, {
          featureProjection: 'EPSG:3857',
          dataProjection: 'EPSG:4326',
        })
      );

      const targetFeature = findById(targetFeatureId);

      try {
        const geometryFamilies = new Set(geoJSONFeatures.map((f) => getGeometryFamily(f.geometry?.type)));

        if (geometryFamilies.size !== 1 || geometryFamilies.has('unsupported')) {
          openNotification({
            type: 'warning',
            title: 'Birləşdirmə',
            content: 'Birləşdirmək üçün yalnız eyni tipli xətt və ya poliqon obyektləri seçilməlidir',
          });
          return;
        }

        const geometryFamily = Array.from(geometryFamilies)[0];

        let mergedGeoJSON: GJFeature;

        if (geometryFamily === 'line') {
          const lineFeatures = geoJSONFeatures.filter(isLineFeature);
          const collection = turf.featureCollection(lineFeatures);
          const combined = turf.combine(collection);
          const multiLine = combined.features[0] as GJFeature<GJMultiLineString>;
          const allCoords = multiLine.geometry.coordinates;
          const joined: number[][][] = [allCoords[0]];
          for (let i = 1; i < allCoords.length; i++) {
            const prev = joined[joined.length - 1];
            const cur = allCoords[i];
            const prevEnd = prev[prev.length - 1];
            const curStart = cur[0];
            if (prevEnd[0] === curStart[0] && prevEnd[1] === curStart[1]) {
              joined[joined.length - 1] = [...prev, ...cur.slice(1)];
            } else {
              joined.push(cur);
            }
          }
          mergedGeoJSON = joined.length === 1
            ? (turf.lineString(joined[0]) as GJFeature<GJLineString>)
            : (turf.multiLineString(joined) as GJFeature<GJMultiLineString>);
        } else {
          const polyFeatures = geoJSONFeatures.filter(isPolygonFeature);

          if (polyFeatures.length < 2) {
            openNotification({
              type: 'warning',
              title: 'Birləşdirmə',
              content: 'Birləşdirmək üçün ən azı iki poliqon seçilməlidir',
            });
            return;
          }

          const unioned = unionPolygonFeatures(polyFeatures);

          if (!unioned) {
            throw new Error('Polygon union failed');
          }

          mergedGeoJSON = unioned;
        }

        const targetColor = targetFeature?.get('color') || DEFAULT_COLOR;
        const targetName = targetFeature?.get('name') ?? null;
        const targetFeatureType = targetFeature?.get('featureType') ?? null;

        features.forEach((f) => {
          const rid = (f.getId() as string) || (f.get('id') as string);
          if (rid) removedIdsRef.current.add(rid);
          vectorSource.removeFeature(f);
        });

        const newId = uuidv4();
        // Pass only the geometry to readFeature — never the source feature's
        // OL properties. `getProperties()` includes a `geometry` key, and
        // GeoJSON.readFeature applies properties AFTER setGeometry, so it would
        // silently overwrite the merged geometry with the target's geometry.
        const rawMergedFeature = format.readFeature(
          { type: 'Feature', geometry: mergedGeoJSON.geometry, properties: {} },
          { featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' }
        );
        const mergedFeature = (Array.isArray(rawMergedFeature) ? rawMergedFeature[0] : rawMergedFeature) as OLFeature<Geometry>;
        mergedFeature.setId(newId);
        mergedFeature.set('id', newId);
        mergedFeature.set('color', targetColor);
        mergedFeature.set('name', targetName);
        mergedFeature.set('featureType', targetFeatureType);
        vectorSource.addFeature(mergedFeature);

        singleSelectRef.current?.getFeatures().clear();
        multiSelectRef.current?.getFeatures().clear();
        updateSelection(new Set());

        openNotification({
          type: 'success',
          title: 'Birləşdirmə',
          content: `${features.length} feature uğurla birləşdirildi`,
        });
      } catch (err) {
        console.error('Merge error:', err);
        openNotification({
          type: 'error',
          title: 'Xəta',
          content: 'Birləşdirmə zamanı xəta baş verdi',
        });
      }
    },

    setSelectedFeaturesColor: (color: string) => {
      const vectorSource = vectorSourceRef.current;
      if (!vectorSource) return;

      selectedIdsRef.current.forEach((id) => {
        const feature =
          (vectorSource.getFeatureById(id) as OLFeature<Geometry> | null) ??
          vectorSource.getFeatures().find((f) => f.get('id') === id) ??
          null;
        if (feature) {
          feature.set('color', color);
        }
      });

      refreshStyles();
    },

    getSaveData: (): GeoJSONFeature[] => {
      const vectorSource = vectorSourceRef.current;
      if (!vectorSource) return [];

      const format = new GeoJSON();
      return vectorSource.getFeatures().map((f) => {
        const id = (f.getId() as string) || (f.get('id') as string);
        const geoJSON = format.writeFeatureObject(f, {
          featureProjection: 'EPSG:3857',
          dataProjection: 'EPSG:4326',
        });
        return {
          type: 'Feature' as const,
          id,
          geometry: geoJSON.geometry as GeoJSONFeature['geometry'],
          properties: {
            id,
            name: f.get('name') ?? null,
            color: f.get('color') || DEFAULT_COLOR,
            featureType: f.get('featureType') ?? null,
          },
        };
      });
    },

    getPendingDeletions: (): string[] => Array.from(removedIdsRef.current),

    clearPendingDeletions: () => {
      removedIdsRef.current.clear();
    },

    exportGeoJSON: (): GeoJSONFeature[] => {
      const vectorSource = vectorSourceRef.current;
      if (!vectorSource) return [];

      const format = new GeoJSON();
      return vectorSource.getFeatures().map((f) => {
        const geoJSON = format.writeFeatureObject(f, {
          featureProjection: 'EPSG:3857',
          dataProjection: 'EPSG:4326',
        });
        return {
          ...geoJSON,
          type: 'Feature' as const,
          id: f.getId() as string,
          geometry: geoJSON.geometry as GeoJSONFeature['geometry'],
          properties: {
            ...geoJSON.properties,
            id: f.getId() as string,
            color: f.get('color') || DEFAULT_COLOR,
            name: f.get('name') || null,
            featureType: f.get('featureType') || null,
          },
        };
      });
    },

    deleteSelectedFeatures: () => {
      const vectorSource = vectorSourceRef.current;
      if (!vectorSource) return;

      const count = selectedIdsRef.current.size;
      selectedIdsRef.current.forEach((id) => {
        const feature =
          (vectorSource.getFeatureById(id) as OLFeature<Geometry> | null) ??
          vectorSource.getFeatures().find((f) => f.get('id') === id) ??
          null;
        if (feature) vectorSource.removeFeature(feature);
      });

      singleSelectRef.current?.getFeatures().clear();
      multiSelectRef.current?.getFeatures().clear();
      updateSelection(new Set());

      openNotification({
        type: 'success',
        title: 'Silinmə',
        content: `${count} feature silindi`,
      });
    },

    getSelectedFeaturesInfo: (): GisFeatureInfo[] => {
      const vectorSource = vectorSourceRef.current;
      if (!vectorSource) return [];

      return Array.from(selectedIdsRef.current)
        .map((id) => {
          const f =
            (vectorSource.getFeatureById(id) as OLFeature<Geometry> | null) ??
            vectorSource.getFeatures().find((feat) => feat.get('id') === id) ??
            null;
          if (!f) return null;
          return {
            id: (f.getId() as string) || f.get('id'),
            name: f.get('name') ?? null,
            color: f.get('color') || DEFAULT_COLOR,
            featureType: f.get('featureType') ?? null,
          };
        })
        .filter(Boolean) as GisFeatureInfo[];
    },

    updateFeatureProperty: (id: string, props: Partial<GeoJSONFeatureProperties>) => {
      const vectorSource = vectorSourceRef.current;
      if (!vectorSource) return;

      const feature =
        (vectorSource.getFeatureById(id) as OLFeature<Geometry> | null) ??
        vectorSource.getFeatures().find((f) => f.get('id') === id) ??
        null;
      if (!feature) return;

      Object.entries(props).forEach(([key, value]) => {
        feature.set(key, value);
      });

      refreshStyles();
    },

    applySelectByLocation: (relationship: SpatialRelationship, distanceMeters: number): number => {
      const vectorSource = vectorSourceRef.current;
      if (!vectorSource) return 0;

      const sourceIds = Array.from(selectedIdsRef.current);
      if (sourceIds.length === 0) return 0;

      const findById = (id: string) =>
        (vectorSource.getFeatureById(id) as OLFeature<Geometry> | null) ??
        vectorSource.getFeatures().find((f) => f.get('id') === id) ??
        null;

      const format = new GeoJSON();
      const sourceFeatures = sourceIds.map(findById).filter(Boolean) as OLFeature<Geometry>[];

      let sourceGeoJSONs: GJFeature[] = sourceFeatures.map((f) =>
        format.writeFeatureObject(f, {
          featureProjection: 'EPSG:3857',
          dataProjection: 'EPSG:4326',
        }) as GJFeature
      );

      if (distanceMeters > 0) {
        sourceGeoJSONs = sourceGeoJSONs
          .map((geo) => {
            try {
              return turf.buffer(geo as GJFeature<GJPolygon | GJMultiPolygon | GJLineString>, distanceMeters, { units: 'meters' }) as GJFeature | undefined;
            } catch {
              return undefined;
            }
          })
          .filter(Boolean) as GJFeature[];
      }

      const test = (feat: GJFeature, src: GJFeature): boolean => {
        try {
          switch (relationship) {
            case 'intersects': return turf.booleanIntersects(feat, src);
            case 'within': return turf.booleanWithin(feat, src);
            case 'contains': return turf.booleanContains(feat, src);
            case 'touches': return turf.booleanTouches(feat, src);
            case 'disjoint': return turf.booleanDisjoint(feat, src);
            default: return false;
          }
        } catch {
          return false;
        }
      };

      const newSelection = new Set<string>();
      vectorSource.getFeatures().forEach((f) => {
        const id = (f.getId() as string) || (f.get('id') as string);
        if (!id) return;

        const featGeoJSON = format.writeFeatureObject(f, {
          featureProjection: 'EPSG:3857',
          dataProjection: 'EPSG:4326',
        }) as GJFeature;

        for (const sourceGeo of sourceGeoJSONs) {
          if (test(featGeoJSON, sourceGeo)) {
            newSelection.add(id);
            break;
          }
        }
      });

      singleSelectRef.current?.getFeatures().clear();
      multiSelectRef.current?.getFeatures().clear();
      newSelection.forEach((id) => {
        const feature = findById(id);
        if (feature) singleSelectRef.current?.getFeatures().push(feature);
      });

      updateSelection(newSelection);
      return newSelection.size;
    },
  }));

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    />
  );
});

MapView.displayName = 'MapView';

export default MapView;

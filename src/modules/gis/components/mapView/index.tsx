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

  const singleSelectRef = useRef<Select | null>(null);
  const multiSelectRef = useRef<Select | null>(null);
  const modifyRef = useRef<Modify | null>(null);
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
      drawCutRef.current,
      drawNewRef.current,
    ].forEach((interaction) => {
      if (interaction) map.removeInteraction(interaction);
    });
    drawNewRef.current = null;

    singleSelectRef.current?.getFeatures().clear();
    multiSelectRef.current?.getFeatures().clear();
    updateSelection(new Set());

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
        break;
      case 'cut':
        if (drawCutRef.current) map.addInteraction(drawCutRef.current);
        break;
      case 'drawPolygon':
        setupDrawNew(map, 'Polygon');
        break;
      case 'drawLine':
        setupDrawNew(map, 'LineString');
        break;
      case 'drawPoint':
        setupDrawNew(map, 'Point');
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
      if (selectedIds.length < 2) return;

      const format = new GeoJSON();
      const findById = (id: string) =>
        (vectorSource.getFeatureById(id) as OLFeature<Geometry> | null) ??
        vectorSource.getFeatures().find((f) => f.get('id') === id) ??
        null;

      const features = selectedIds.map(findById).filter(Boolean) as OLFeature<Geometry>[];

      const geoJSONFeatures = features.map((f) =>
        format.writeFeatureObject(f, {
          featureProjection: 'EPSG:3857',
          dataProjection: 'EPSG:4326',
        })
      );

      const targetFeature = findById(targetFeatureId);

      try {
        const firstGeomType = geoJSONFeatures[0]?.geometry?.type;
        const isLineGeometry = firstGeomType === 'LineString' || firstGeomType === 'MultiLineString';

        let mergedGeoJSON: GJFeature;

        if (isLineGeometry) {
          const lineFeatures = geoJSONFeatures as GJFeature<GJLineString | GJMultiLineString>[];
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
          let merged = geoJSONFeatures[0] as unknown as GJFeature<GJPolygon | GJMultiPolygon>;
          for (let i = 1; i < geoJSONFeatures.length; i++) {
            const next = geoJSONFeatures[i] as unknown as GJFeature<GJPolygon | GJMultiPolygon>;
            const result = turf.union(turf.featureCollection([merged, next]));
            if (result) merged = result as GJFeature<GJPolygon | GJMultiPolygon>;
          }
          mergedGeoJSON = merged;
        }

        features.forEach((f) => vectorSource.removeFeature(f));

        const newId = uuidv4();
        const targetProps = targetFeature?.getProperties() || {};
        const rawMergedFeature = format.readFeature(
          {
            ...mergedGeoJSON,
            properties: { ...targetProps, id: newId },
          },
          { featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' }
        );
        const mergedFeature = (Array.isArray(rawMergedFeature) ? rawMergedFeature[0] : rawMergedFeature) as OLFeature<Geometry>;
        mergedFeature.setId(newId);
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

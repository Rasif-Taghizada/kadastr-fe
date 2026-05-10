import { useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import GeoJSON from 'ol/format/GeoJSON';
import { fromLonLat } from 'ol/proj';
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
import { createBox } from 'ol/interaction/Draw';
import * as turf from '@turf/turf';
import type { Feature as GJFeature, LineString as GJLineString, Polygon as GJPolygon, MultiPolygon as GJMultiPolygon } from 'geojson';
import { v4 as uuidv4 } from 'uuid';
import 'ol/ol.css';

import { getFeaturesService } from '@/common/libs/services/gisFeaturesService';
import { openNotification } from '@/common/components/shared/notification';
import type { MapViewProps, MapViewRef, GisFeatureInfo, GeoJSONFeature } from '@/modules/gis/types';

const BAKU_CENTER = fromLonLat([49.8671, 40.4093]);
const DEFAULT_COLOR = '#3388ff';

const makeFeatureStyle = (color: string, isSelected: boolean): Style => {
  if (isSelected) {
    return new Style({
      fill: new Fill({ color: 'rgba(255, 102, 0, 0.25)' }),
      stroke: new Stroke({ color: '#ff6600', width: 3 }),
      image: new CircleStyle({
        radius: 6,
        fill: new Fill({ color: '#ff6600' }),
        stroke: new Stroke({ color: '#fff', width: 1.5 }),
      }),
    });
  }
  return new Style({
    fill: new Fill({ color: `${color}40` }),
    stroke: new Stroke({ color, width: 2 }),
    image: new CircleStyle({
      radius: 5,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: '#fff', width: 1 }),
    }),
  });
};

const cutLineStyle = new Style({
  stroke: new Stroke({ color: '#ff0000', width: 2, lineDash: [8, 4] }),
});

const selectByLocationStyle = new Style({
  fill: new Fill({ color: 'rgba(0, 102, 255, 0.1)' }),
  stroke: new Stroke({ color: '#0066ff', width: 2, lineDash: [6, 3] }),
});

export type { MapViewRef };

const MapView = forwardRef<MapViewRef, MapViewProps>(({ activeTool, onSelectionChange }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const vectorSourceRef = useRef<VectorSource<OLFeature<Geometry>> | null>(null);
  const vectorLayerRef = useRef<VectorLayer<VectorSource<OLFeature<Geometry>>> | null>(null);
  const selectedIdsRef = useRef<Set<string>>(new Set());

  const singleSelectRef = useRef<Select | null>(null);
  const multiSelectRef = useRef<Select | null>(null);
  const modifyRef = useRef<Modify | null>(null);
  const drawCutRef = useRef<Draw | null>(null);
  const drawSelectByLocationRef = useRef<Draw | null>(null);
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
        zoom: 11,
      }),
    });
    mapRef.current = map;

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
        const id = f.getId() as string;
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
        const id = f.getId() as string;
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
      tempSource.clear();
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
      drawSelectByLocationRef.current,
    ].forEach((interaction) => {
      if (interaction) map.removeInteraction(interaction);
    });

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
      case 'selectByLocation':
        setupSelectByLocationDraw(map);
        break;
    }
  }, [activeTool]);

  const setupSelectByLocationDraw = (map: Map) => {
    const tempSource = tempSourceRef.current;
    if (!tempSource) return;

    const draw = new Draw({
      source: tempSource,
      type: 'Circle',
      geometryFunction: createBox(),
      style: selectByLocationStyle,
    });

    draw.on('drawend', (e) => {
      const drawnFeature = e.feature;
      tempSource.clear();
      map.removeInteraction(draw);

      const format = new GeoJSON();
      const drawnGeoJSON = format.writeFeatureObject(drawnFeature, {
        featureProjection: 'EPSG:3857',
        dataProjection: 'EPSG:4326',
      });

      const newSelected = new Set<string>();

      vectorSourceRef.current?.getFeatures().forEach((f) => {
        const featureGeoJSON = format.writeFeatureObject(f, {
          featureProjection: 'EPSG:3857',
          dataProjection: 'EPSG:4326',
        });

        try {
          if (turf.booleanIntersects(featureGeoJSON as GJFeature, drawnGeoJSON as GJFeature)) {
            const id = f.getId() as string;
            if (id) newSelected.add(id);
          }
        } catch {
          // skip invalid geometries
        }
      });

      updateSelection(newSelected);

      if (newSelected.size > 0) {
        openNotification({
          type: 'info',
          title: 'Seçim',
          content: `${newSelected.size} feature seçildi`,
        });
      }

      // Re-setup for next use
      setupSelectByLocationDraw(map);
    });

    drawSelectByLocationRef.current = draw;
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
        vectorSource.removeFeature(feature);

        [part1, part2].forEach((part) => {
          const newId = uuidv4();
          const rawFeature = format.readFeature(
            { ...part, properties: { ...feature.getProperties(), id: newId } },
            { featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' }
          );
          const newFeature = (Array.isArray(rawFeature) ? rawFeature[0] : rawFeature) as OLFeature<Geometry>;
          newFeature.setId(newId);
          vectorSource.addFeature(newFeature);
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
    const ext = diagonal * 3;

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
    const big = ext * 2;

    const leftHalf = turf.polygon([[
      extStart,
      extEnd,
      [extEnd[0] + nx * big, extEnd[1] + ny * big],
      [extStart[0] + nx * big, extStart[1] + ny * big],
      extStart,
    ]]);

    const part1 = turf.intersect(turf.featureCollection([polygon, leftHalf]));
    if (!part1) return null;

    const part2 = turf.difference(turf.featureCollection([polygon, part1]));
    if (!part2) return null;

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
      const features = selectedIds
        .map((id) => vectorSource.getFeatureById(id))
        .filter(Boolean) as OLFeature<Geometry>[];

      const geoJSONFeatures = features.map((f) =>
        format.writeFeatureObject(f, {
          featureProjection: 'EPSG:3857',
          dataProjection: 'EPSG:4326',
        })
      );

      const targetFeature = vectorSource.getFeatureById(targetFeatureId);

      try {
        let merged = geoJSONFeatures[0] as unknown as GJFeature<GJPolygon | GJMultiPolygon>;
        for (let i = 1; i < geoJSONFeatures.length; i++) {
          const next = geoJSONFeatures[i] as unknown as GJFeature<GJPolygon | GJMultiPolygon>;
          const result = turf.union(turf.featureCollection([merged, next]));
          if (result) merged = result as GJFeature<GJPolygon | GJMultiPolygon>;
        }

        features.forEach((f) => vectorSource.removeFeature(f));

        const newId = uuidv4();
        const targetProps = targetFeature?.getProperties() || {};
        const rawMergedFeature = format.readFeature(
          {
            ...merged,
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
        const feature = vectorSource.getFeatureById(id);
        if (feature) {
          feature.set('color', color);
          const props = feature.get('properties') || {};
          feature.set('properties', { ...props, color });
        }
      });

      refreshStyles();
    },

    getSaveData: (): GeoJSONFeature[] => {
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
          },
        };
      });
    },

    deleteSelectedFeatures: () => {
      const vectorSource = vectorSourceRef.current;
      if (!vectorSource) return;

      const count = selectedIdsRef.current.size;
      selectedIdsRef.current.forEach((id) => {
        const feature = vectorSource.getFeatureById(id);
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
          const f = vectorSource.getFeatureById(id);
          if (!f) return null;
          return {
            id: f.getId() as string,
            name: f.get('name') || null,
            color: f.get('color') || DEFAULT_COLOR,
          };
        })
        .filter(Boolean) as GisFeatureInfo[];
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

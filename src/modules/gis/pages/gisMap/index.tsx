import React, { useRef, useState, useCallback } from 'react';
import { Typography, Spin, Upload } from 'antd';
import { useTranslation } from 'react-i18next';
import MapView from '@/modules/gis/components/mapView';
import Toolbar from '@/modules/gis/components/toolbar';
import MergeModal from '@/modules/gis/components/mergeModal';
import FeatureInfoPanel from '@/modules/gis/components/featureInfoPanel';
import GisHeader from '@/modules/gis/components/gisHeader';
import { saveFeaturesService, uploadFeaturesService } from '@/common/libs/services/gisFeaturesService';
import { openNotification } from '@/common/components/shared/notification';
import type { ToolType, GisFeatureInfo, MapViewRef } from '@/modules/gis/types';

const { Text } = Typography;

const GisMap: React.FC = () => {
  const { t } = useTranslation();
  const mapViewRef = useRef<MapViewRef>(null);

  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [selectedCount, setSelectedCount] = useState(0);
  const [selectedFeature, setSelectedFeature] = useState<GisFeatureInfo | null>(null);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeFeatures, setMergeFeatures] = useState<GisFeatureInfo[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [coordinates, setCoordinates] = useState<[number, number] | null>(null);

  const handleToolChange = useCallback((tool: ToolType) => {
    setActiveTool(tool);
    setSelectedFeature(null);
  }, []);

  const handleSelectionChange = useCallback((count: number) => {
    setSelectedCount(count);
    if (count === 1 && (activeTool === 'select' || activeTool === 'edit')) {
      const info = mapViewRef.current?.getSelectedFeaturesInfo() ?? [];
      setSelectedFeature(info[0] ?? null);
    } else {
      setSelectedFeature(null);
    }
  }, [activeTool]);

  const handleFeatureDrawn = useCallback(() => {
    // After drawing, stay in draw mode so user can continue drawing
  }, []);

  const handleMergeClick = () => {
    if (activeTool !== 'merge') {
      // First click: activate merge/multi-select mode
      setActiveTool('merge');
      setSelectedFeature(null);
      openNotification({
        type: 'info',
        title: t('gis.merge'),
        content: t('gis.merge_select_features'),
      });
      return;
    }

    // Already in merge mode: confirm selection
    const info = mapViewRef.current?.getSelectedFeaturesInfo() ?? [];
    if (info.length < 2) {
      openNotification({
        type: 'warning',
        title: t('gis.merge'),
        content: t('gis.merge_min_two'),
      });
      return;
    }

    setMergeFeatures(info);
    setMergeModalOpen(true);
  };

  const handleMergeConfirm = (targetFeatureId: string) => {
    mapViewRef.current?.confirmMerge(targetFeatureId);
    setMergeModalOpen(false);
    setMergeFeatures([]);
    setActiveTool('select');
    setSelectedCount(0);
    setSelectedFeature(null);
  };

  const handleMergeCancel = () => {
    setMergeModalOpen(false);
    setMergeFeatures([]);
  };

  const handleColorChange = (color: string) => {
    mapViewRef.current?.setSelectedFeaturesColor(color);
    if (selectedFeature) {
      setSelectedFeature({ ...selectedFeature, color });
    }
  };

  const handleDeleteClick = () => {
    if (selectedCount === 0) return;
    mapViewRef.current?.deleteSelectedFeatures();
    setSelectedCount(0);
    setSelectedFeature(null);
  };

  const handleSaveClick = async () => {
    const features = mapViewRef.current?.getSaveData() ?? [];

    if (features.length === 0) {
      openNotification({
        type: 'warning',
        title: t('gis.save'),
        content: t('gis.no_features_to_save'),
      });
      return;
    }

    setIsSaving(true);
    try {
      await saveFeaturesService(features);
      openNotification({
        type: 'success',
        title: t('gis.save'),
        content: t('gis.save_success'),
      });
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportClick = () => {
    const features = mapViewRef.current?.exportGeoJSON() ?? [];
    if (features.length === 0) {
      openNotification({
        type: 'warning',
        title: t('gis.export_geojson'),
        content: t('gis.no_features_to_save'),
      });
      return;
    }

    const geojson = {
      type: 'FeatureCollection',
      features,
    };
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gis-export-${new Date().toISOString().slice(0, 10)}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUploadClick = () => {
    document.getElementById('geojson-upload-input')?.click();
  };

  const handleFileUpload = async (file: File) => {
    try {
      const text = await file.text();
      const geoJSON = JSON.parse(text);

      if (geoJSON.type !== 'FeatureCollection' || !Array.isArray(geoJSON.features)) {
        openNotification({
          type: 'error',
          title: t('gis.import_geojson'),
          content: t('gis.invalid_geojson'),
        });
        return;
      }

      await uploadFeaturesService(geoJSON.features);
      openNotification({
        type: 'success',
        title: t('gis.import_geojson'),
        content: `${geoJSON.features.length} ${t('gis.import_success')}`,
      });

      window.location.reload();
    } catch (err) {
      console.error('Upload error:', err);
      openNotification({
        type: 'error',
        title: t('gis.import_geojson'),
        content: t('gis.import_error'),
      });
    }

    return false;
  };

  const handleUpdateFeatureName = (id: string, name: string) => {
    mapViewRef.current?.updateFeatureProperty(id, { name: name || null });
    if (selectedFeature?.id === id) {
      setSelectedFeature({ ...selectedFeature, name: name || null });
    }
  };

  const toolLabel: Record<ToolType, string> = {
    select: t('gis.tool_select'),
    merge: t('gis.tool_merge'),
    cut: t('gis.tool_cut'),
    edit: t('gis.tool_edit_vertex'),
    selectByLocation: t('gis.tool_select_by_location'),
    drawPolygon: t('gis.tool_draw_polygon'),
    drawLine: t('gis.tool_draw_line'),
    drawPoint: t('gis.tool_draw_point'),
  };

  const formatCoord = (n: number, decimals: number) => n.toFixed(decimals);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <GisHeader />

      {/* Map pushed down by header height */}
      <div style={{ position: 'absolute', top: 48, left: 0, right: 0, bottom: 0 }}>
        <MapView
          ref={mapViewRef}
          activeTool={activeTool}
          onSelectionChange={handleSelectionChange}
          onCoordinateChange={setCoordinates}
          onFeatureDrawn={handleFeatureDrawn}
        />
      </div>

      <Toolbar
        activeTool={activeTool}
        selectedCount={selectedCount}
        isSaving={isSaving}
        onToolChange={handleToolChange}
        onMergeClick={handleMergeClick}
        onDeleteClick={handleDeleteClick}
        onSaveClick={handleSaveClick}
        onColorChange={handleColorChange}
        onUploadClick={handleUploadClick}
        onExportClick={handleExportClick}
      />

      <FeatureInfoPanel
        feature={selectedFeature}
        onUpdateName={handleUpdateFeatureName}
      />

      {/* Status bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          background: 'rgba(255,255,255,0.9)',
          borderRadius: 6,
          padding: '4px 12px',
          boxShadow: '0 1px 6px rgba(0,0,0,0.12)',
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          zIndex: 1000,
        }}
      >
        <Text style={{ fontSize: 12 }}>
          {t('gis.active_tool')}: <strong>{toolLabel[activeTool]}</strong>
        </Text>
        {selectedCount > 0 && (
          <Text style={{ fontSize: 12 }}>
            {t('gis.selected')}: <strong>{selectedCount}</strong>
          </Text>
        )}
        {coordinates && (
          <Text style={{ fontSize: 12, color: '#666' }}>
            {formatCoord(coordinates[1], 5)}°N, {formatCoord(coordinates[0], 5)}°E
          </Text>
        )}
        {isSaving && <Spin size="small" />}
      </div>

      <Upload
        accept=".geojson,.json"
        showUploadList={false}
        beforeUpload={(file) => {
          handleFileUpload(file);
          return false;
        }}
      >
        <span id="geojson-upload-input" style={{ display: 'none' }} />
      </Upload>

      <MergeModal
        open={mergeModalOpen}
        features={mergeFeatures}
        onConfirm={handleMergeConfirm}
        onCancel={handleMergeCancel}
      />
    </div>
  );
};

export default GisMap;

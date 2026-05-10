import React, { useRef, useState, useCallback } from 'react';
import { Typography, Spin, Upload } from 'antd';
import { useTranslation } from 'react-i18next';
import MapView from '@/modules/gis/components/mapView';
import Toolbar from '@/modules/gis/components/toolbar';
import MergeModal from '@/modules/gis/components/mergeModal';
import { saveFeaturesService, uploadFeaturesService } from '@/common/libs/services/gisFeaturesService';
import { openNotification } from '@/common/components/shared/notification';
import type { ToolType, GisFeatureInfo, MapViewRef } from '@/modules/gis/types';

const { Text } = Typography;

const GisMap: React.FC = () => {
  const { t } = useTranslation();
  const mapViewRef = useRef<MapViewRef>(null);

  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [selectedCount, setSelectedCount] = useState(0);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeFeatures, setMergeFeatures] = useState<GisFeatureInfo[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const handleToolChange = useCallback((tool: ToolType) => {
    setActiveTool(tool);
  }, []);

  const handleSelectionChange = useCallback((count: number) => {
    setSelectedCount(count);
  }, []);

  const handleMergeClick = () => {
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
  };

  const handleMergeCancel = () => {
    setMergeModalOpen(false);
    setMergeFeatures([]);
  };

  const handleColorChange = (color: string) => {
    mapViewRef.current?.setSelectedFeaturesColor(color);
  };

  const handleDeleteClick = () => {
    if (selectedCount === 0) return;
    mapViewRef.current?.deleteSelectedFeatures();
    setSelectedCount(0);
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

  const handleUploadClick = () => {
    // Trigger hidden file input
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

      // Reload page to show newly imported features
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

  const toolLabel: Record<ToolType, string> = {
    select: t('gis.tool_select'),
    merge: t('gis.tool_merge'),
    cut: t('gis.tool_cut'),
    edit: t('gis.tool_edit_vertex'),
    selectByLocation: t('gis.tool_select_by_location'),
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* Map */}
      <MapView
        ref={mapViewRef}
        activeTool={activeTool}
        onSelectionChange={handleSelectionChange}
      />

      {/* Toolbar */}
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
        {isSaving && <Spin size="small" />}
      </div>

      {/* Hidden file input for GeoJSON import */}
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

      {/* Merge modal */}
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

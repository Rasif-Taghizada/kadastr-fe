import React from 'react';
import { Button, ColorPicker, Tooltip, Badge, Divider } from 'antd';
import {
  SelectOutlined,
  MergeCellsOutlined,
  ScissorOutlined,
  EditOutlined,
  AimOutlined,
  DeleteOutlined,
  SaveOutlined,
  UploadOutlined,
  BgColorsOutlined,
  DownloadOutlined,
  BorderOutlined,
  LineChartOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { ToolbarProps } from './type';
import type { ToolType } from '@/modules/gis/types';

const Toolbar: React.FC<ToolbarProps> = ({
  activeTool,
  selectedCount,
  isSaving,
  onToolChange,
  onMergeClick,
  onSelectByLocationClick,
  onDeleteClick,
  onSaveClick,
  onColorChange,
  onUploadClick,
  onExportClick,
}) => {
  const { t } = useTranslation();

  const selectTools: { key: ToolType; icon: React.ReactNode; label: string }[] = [
    { key: 'select', icon: <SelectOutlined />, label: t('gis.tool_select') },
    { key: 'edit', icon: <EditOutlined />, label: t('gis.tool_edit_vertex') },
    { key: 'cut', icon: <ScissorOutlined />, label: t('gis.tool_cut') },
  ];

  const drawTools: { key: ToolType; icon: React.ReactNode; label: string }[] = [
    { key: 'drawPolygon', icon: <BorderOutlined />, label: t('gis.tool_draw_polygon') },
    { key: 'drawLine', icon: <LineChartOutlined />, label: t('gis.tool_draw_line') },
    { key: 'drawPoint', icon: <EnvironmentOutlined />, label: t('gis.tool_draw_point') },
  ];

  return (
    <div
      style={{
        position: 'absolute',
        top: 60,
        left: 12,
        zIndex: 1000,
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
        padding: '8px 6px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minWidth: 44,
      }}
    >
      {selectTools.map(({ key, icon, label }) => (
        <Tooltip key={key} title={label} placement="right">
          <Button
            type={activeTool === key ? 'primary' : 'default'}
            icon={icon}
            onClick={() => onToolChange(key)}
            style={{ width: 36, height: 36, padding: 0 }}
          />
        </Tooltip>
      ))}

      <Divider style={{ margin: '4px 0' }} />

      {drawTools.map(({ key, icon, label }) => (
        <Tooltip key={key} title={label} placement="right">
          <Button
            type={activeTool === key ? 'primary' : 'default'}
            icon={icon}
            onClick={() => onToolChange(key)}
            style={{ width: 36, height: 36, padding: 0 }}
          />
        </Tooltip>
      ))}

      <Divider style={{ margin: '4px 0' }} />

      <Tooltip
        title={activeTool === 'merge' ? t('gis.merge_confirm_selection') : t('gis.tool_merge')}
        placement="right"
      >
        <Button
          type={activeTool === 'merge' ? 'primary' : 'default'}
          icon={<MergeCellsOutlined />}
          onClick={onMergeClick}
          style={{ width: 36, height: 36, padding: 0 }}
        />
      </Tooltip>

      <Tooltip title={t('gis.tool_select_by_location')} placement="right">
        <Button
          icon={<AimOutlined />}
          onClick={onSelectByLocationClick}
          disabled={selectedCount === 0}
          style={{ width: 36, height: 36, padding: 0 }}
        />
      </Tooltip>

      <Tooltip title={t('gis.change_color')} placement="right">
        <ColorPicker
          size="small"
          defaultValue="#3388ff"
          onChange={(_, hex) => onColorChange(hex)}
          disabled={selectedCount === 0}
          trigger="click"
        >
          <Button
            icon={<BgColorsOutlined />}
            disabled={selectedCount === 0}
            style={{ width: 36, height: 36, padding: 0 }}
          />
        </ColorPicker>
      </Tooltip>

      <Tooltip title={t('gis.delete_selected')} placement="right">
        <Badge count={selectedCount} size="small" offset={[-4, 4]}>
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={onDeleteClick}
            disabled={selectedCount === 0}
            style={{ width: 36, height: 36, padding: 0 }}
          />
        </Badge>
      </Tooltip>

      <Divider style={{ margin: '4px 0' }} />

      <Tooltip title={t('gis.import_geojson')} placement="right">
        <Button
          icon={<UploadOutlined />}
          onClick={onUploadClick}
          style={{ width: 36, height: 36, padding: 0 }}
        />
      </Tooltip>

      <Tooltip title={t('gis.export_geojson')} placement="right">
        <Button
          icon={<DownloadOutlined />}
          onClick={onExportClick}
          style={{ width: 36, height: 36, padding: 0 }}
        />
      </Tooltip>

      <Tooltip title={t('gis.save')} placement="right">
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={isSaving}
          onClick={onSaveClick}
          style={{ width: 36, height: 36, padding: 0, background: '#52c41a', borderColor: '#52c41a' }}
        />
      </Tooltip>
    </div>
  );
};

export default Toolbar;

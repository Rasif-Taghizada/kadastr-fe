import React, { useState, useEffect } from 'react';
import { Typography, Input, Tag, Divider, Button } from 'antd';
import { EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { GisFeatureInfo } from '@/modules/gis/types';

const { Text } = Typography;

interface FeatureInfoPanelProps {
  feature: GisFeatureInfo | null;
  onUpdateName: (id: string, name: string) => void;
}

const FeatureInfoPanel: React.FC<FeatureInfoPanelProps> = ({ feature, onUpdateName }) => {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [nameValue, setNameValue] = useState('');

  useEffect(() => {
    setEditing(false);
    setNameValue(feature?.name || '');
  }, [feature?.id]);

  if (!feature) return null;

  const handleSaveName = () => {
    onUpdateName(feature.id, nameValue.trim());
    setEditing(false);
  };

  const handleCancel = () => {
    setNameValue(feature.name || '');
    setEditing(false);
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 1000,
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
        padding: '12px 14px',
        minWidth: 200,
        maxWidth: 260,
      }}
    >
      <Text strong style={{ fontSize: 12, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {t('gis.feature_info')}
      </Text>

      <Divider style={{ margin: '8px 0' }} />

      <div style={{ marginBottom: 10 }}>
        <Text style={{ fontSize: 11, color: '#999', display: 'block', marginBottom: 3 }}>
          {t('gis.feature_name')}
        </Text>
        {editing ? (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <Input
              size="small"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onPressEnter={handleSaveName}
              autoFocus
              style={{ flex: 1 }}
            />
            <Button
              size="small"
              type="primary"
              icon={<CheckOutlined />}
              onClick={handleSaveName}
              style={{ padding: '0 4px' }}
            />
            <Button
              size="small"
              icon={<CloseOutlined />}
              onClick={handleCancel}
              style={{ padding: '0 4px' }}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Text style={{ flex: 1, fontWeight: 500 }}>
              {feature.name || <span style={{ color: '#bbb' }}>{t('gis.unnamed_feature')}</span>}
            </Text>
            <Button
              size="small"
              type="text"
              icon={<EditOutlined />}
              onClick={() => { setNameValue(feature.name || ''); setEditing(true); }}
              style={{ padding: '0 4px', height: 20 }}
            />
          </div>
        )}
      </div>

      {feature.featureType && (
        <div style={{ marginBottom: 10 }}>
          <Text style={{ fontSize: 11, color: '#999', display: 'block', marginBottom: 3 }}>
            {t('gis.feature_type')}
          </Text>
          <Tag style={{ margin: 0 }}>{feature.featureType}</Tag>
        </div>
      )}

      <div>
        <Text style={{ fontSize: 11, color: '#999', display: 'block', marginBottom: 3 }}>
          {t('gis.feature_color')}
        </Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: 3,
              background: feature.color,
              border: '1px solid #ddd',
              flexShrink: 0,
            }}
          />
          <Text style={{ fontSize: 12, color: '#555' }}>{feature.color}</Text>
        </div>
      </div>

      <Divider style={{ margin: '8px 0' }} />

      <Text style={{ fontSize: 10, color: '#ccc', wordBreak: 'break-all' }}>
        ID: {feature.id}
      </Text>
    </div>
  );
};

export default FeatureInfoPanel;

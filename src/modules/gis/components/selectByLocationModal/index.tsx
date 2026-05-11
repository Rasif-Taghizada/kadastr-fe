import React, { useState, useEffect } from 'react';
import { Select, InputNumber, Space, Typography, Form } from 'antd';
import { useTranslation } from 'react-i18next';
import AppModal from '@/common/components/shared/modals';
import AppButton from '@/common/components/shared/button';
import type { SpatialRelationship } from '@/modules/gis/types';
import type { SelectByLocationModalProps } from './type';

const { Text } = Typography;

const SelectByLocationModal: React.FC<SelectByLocationModalProps> = ({
  open,
  sourceCount,
  onApply,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [relationship, setRelationship] = useState<SpatialRelationship>('intersects');
  const [distance, setDistance] = useState<number>(0);

  useEffect(() => {
    if (open) {
      setRelationship('intersects');
      setDistance(0);
    }
  }, [open]);

  const handleApply = () => {
    onApply(relationship, distance);
  };

  const relationshipOptions: { value: SpatialRelationship; label: string }[] = [
    { value: 'intersects', label: t('gis.relationship_intersects') },
    { value: 'within', label: t('gis.relationship_within') },
    { value: 'contains', label: t('gis.relationship_contains') },
    { value: 'touches', label: t('gis.relationship_touches') },
    { value: 'disjoint', label: t('gis.relationship_disjoint') },
  ];

  return (
    <AppModal
      open={open}
      onCancel={onCancel}
      title={t('gis.select_by_location_title')}
      width={520}
      footer={
        <Space>
          <AppButton variant="outline" onClick={onCancel}>
            {t('gis.cancel')}
          </AppButton>
          <AppButton variant="primary" onClick={handleApply}>
            {t('gis.select_by_location_apply')}
          </AppButton>
        </Space>
      }
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        {t('gis.select_by_location_description')}
      </Text>

      <div
        style={{
          background: '#f5f7fa',
          padding: '10px 12px',
          borderRadius: 6,
          marginBottom: 16,
          fontSize: 13,
        }}
      >
        <Text strong>{t('gis.select_by_location_source_features')}: </Text>
        <Text>{sourceCount}</Text>
      </div>

      <Form layout="vertical">
        <Form.Item label={t('gis.select_by_location_relationship')}>
          <Select
            value={relationship}
            onChange={(value) => setRelationship(value)}
            options={relationshipOptions}
          />
        </Form.Item>

        <Form.Item
          label={t('gis.select_by_location_distance')}
          help={t('gis.select_by_location_distance_hint')}
        >
          <InputNumber
            value={distance}
            onChange={(value) => setDistance(value ?? 0)}
            min={0}
            step={10}
            style={{ width: '100%' }}
            addonAfter={t('gis.distance_meters')}
          />
        </Form.Item>
      </Form>
    </AppModal>
  );
};

export default SelectByLocationModal;

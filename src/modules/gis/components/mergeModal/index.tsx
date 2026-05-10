import React, { useState, useEffect } from 'react';
import { Radio, Space, Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import AppModal from '@/common/components/shared/modals';
import AppButton from '@/common/components/shared/button';
import type { MergeModalProps } from './type';

const { Text } = Typography;

const MergeModal: React.FC<MergeModalProps> = ({ open, features, onConfirm, onCancel }) => {
  const { t } = useTranslation();
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');

  useEffect(() => {
    if (open && features.length > 0) setSelectedTargetId(features[0].id);
  }, [open, features]);

  const handleConfirm = () => {
    if (!selectedTargetId) return;
    onConfirm(selectedTargetId);
    setSelectedTargetId('');
  };

  const handleCancel = () => {
    setSelectedTargetId('');
    onCancel();
  };

  return (
    <AppModal
      open={open}
      onCancel={handleCancel}
      title={t('gis.merge_modal_title')}
      width={480}
      footer={
        <Space>
          <AppButton variant="outline" onClick={handleCancel}>
            {t('gis.cancel')}
          </AppButton>
          <AppButton variant="primary" onClick={handleConfirm} disabled={!selectedTargetId}>
            {t('gis.merge_confirm')}
          </AppButton>
        </Space>
      }
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        {t('gis.merge_modal_description')}
      </Text>

      <Radio.Group
        value={selectedTargetId}
        onChange={(e) => setSelectedTargetId(e.target.value)}
        style={{ width: '100%' }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {features.map((feature) => (
            <Radio key={feature.id} value={feature.id} style={{ width: '100%' }}>
              <Space>
                <span
                  style={{
                    display: 'inline-block',
                    width: 14,
                    height: 14,
                    borderRadius: 2,
                    background: feature.color,
                    border: '1px solid rgba(0,0,0,0.15)',
                  }}
                />
                <Text>{feature.name || t('gis.unnamed_feature')}</Text>
                <Text type="secondary" style={{ fontSize: 11 }}>({feature.id.slice(0, 8)}...)</Text>
              </Space>
            </Radio>
          ))}
        </Space>
      </Radio.Group>
    </AppModal>
  );
};

export default MergeModal;

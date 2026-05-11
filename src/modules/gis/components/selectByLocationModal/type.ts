import type { SpatialRelationship } from '@/modules/gis/types';

export interface SelectByLocationModalProps {
  open: boolean;
  sourceCount: number;
  onApply: (relationship: SpatialRelationship, distanceMeters: number) => void;
  onCancel: () => void;
}

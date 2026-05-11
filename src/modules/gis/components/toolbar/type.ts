import type { ToolType } from '@/modules/gis/types';

export interface ToolbarProps {
  activeTool: ToolType;
  selectedCount: number;
  isSaving: boolean;
  onToolChange: (tool: ToolType) => void;
  onMergeClick: () => void;
  onSelectByLocationClick: () => void;
  onDeleteClick: () => void;
  onSaveClick: () => void;
  onColorChange: (color: string) => void;
  onUploadClick: () => void;
  onExportClick: () => void;
}

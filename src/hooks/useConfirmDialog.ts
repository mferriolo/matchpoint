import { useState } from 'react';

export interface ConfirmDialogConfig {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'destructive' | 'success' | 'warning' | 'info';
  showIcon?: boolean;
  onConfirm: () => void | Promise<void>;
}

export const useConfirmDialog = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [dialogConfig, setDialogConfig] = useState<ConfirmDialogConfig>({
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    variant: 'info',
    showIcon: true,
    onConfirm: () => {}
  });

  const showConfirmation = (config: ConfirmDialogConfig) => {
    setDialogConfig({
      title: config.title,
      message: config.message,
      confirmText: config.confirmText || 'Confirm',
      cancelText: config.cancelText || 'Cancel',
      variant: config.variant || 'info',
      showIcon: config.showIcon !== false,
      onConfirm: config.onConfirm
    });
    setIsOpen(true);
  };

  const hideConfirmation = () => {
    setIsOpen(false);
  };

  const handleConfirm = async () => {
    try {
      await dialogConfig.onConfirm();
    } catch (error) {
      console.error('Error in confirmation action:', error);
    }
  };

  return {
    isOpen,
    dialogConfig: { ...dialogConfig, onConfirm: handleConfirm },
    showConfirmation,
    hideConfirmation
  };
};
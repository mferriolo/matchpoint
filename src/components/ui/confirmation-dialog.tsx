import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'destructive' | 'success' | 'warning' | 'info';
  showIcon?: boolean;
}

const variantStyles = {
  destructive: {
    icon: XCircle,
    iconColor: 'text-red-600',
    iconBg: 'bg-red-100',
    buttonClass: 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
  },
  success: {
    icon: CheckCircle,
    iconColor: 'text-green-600',
    iconBg: 'bg-green-100',
    buttonClass: 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-yellow-600',
    iconBg: 'bg-yellow-100',
    buttonClass: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500'
  },
  info: {
    icon: Info,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-100',
    buttonClass: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
  }
};

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'info',
  showIcon = true
}) => {
  const style = variantStyles[variant];
  const Icon = style.icon;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          {showIcon && (
            <div className="mx-auto mb-4">
              <div className={cn(
                "flex h-12 w-12 items-center justify-center rounded-full",
                style.iconBg
              )}>
                <Icon className={cn("h-6 w-6", style.iconColor)} />
              </div>
            </div>
          )}
          <AlertDialogTitle className="text-center">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            {message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-center gap-2">
          <AlertDialogCancel onClick={onClose}>
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleConfirm}
            className={cn(
              "text-white",
              style.buttonClass
            )}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ConfirmationDialog;
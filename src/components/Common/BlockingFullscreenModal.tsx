import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export default function BlockingFullscreenModal(props: {
  open: boolean;
  children: ReactNode;
  onBackdropClick?: () => void;
  zIndexClassName?: string;
}) {
  const { open, children, onBackdropClick, zIndexClassName = 'z-[30000]' } = props;

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className={`fixed inset-0 ${zIndexClassName} flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]`}>
      <div className="absolute inset-0" onClick={onBackdropClick} />
      <div className="relative max-h-full max-w-full">{children}</div>
    </div>,
    document.body,
  );
}

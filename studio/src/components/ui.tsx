// Studio UI primitives: buttons, dialogs, menus, tabs, chips, toasts, confirm, skeletons.
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "../lib/util";
import { Icon } from "./Icon";

// ------------------------------------------------------------------ Button
type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle" | "teal";
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg"; icon?: string; iconRight?: string; loading?: boolean };
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "secondary", size = "md", icon, iconRight, loading, children, className, ...rest }, ref) {
  return (
    <button ref={ref} type="button" {...rest} className={cx("btn", `btn-${variant}`, `btn-${size}`, !children && "btn-icon", className)} disabled={rest.disabled || loading} aria-busy={loading || undefined}>
      {loading ? <Spinner size={size === "lg" ? 16 : 14} /> : icon ? <Icon name={icon} size={size === "sm" ? 14 : 16} /> : null}
      {children && <span>{children}</span>}
      {iconRight && <Icon name={iconRight} size={14} className="btn-icon-right" />}
    </button>
  );
});

export function IconButton({ icon, label, size = 16, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string; size?: number }) {
  return (
    <button {...rest} className={cx("icon-btn", className)} aria-label={label} title={label} type={rest.type ?? "button"}>
      <Icon name={icon} size={size} />
    </button>
  );
}

export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return <span className={cx("spinner", className)} style={{ width: size, height: size }} role="status" aria-label="Loading" />;
}

// ------------------------------------------------------------------ Chips & badges
export function Chip({ tone = "neutral", children, icon, dot, title, className }: { tone?: "neutral" | "brand" | "teal" | "success" | "warning" | "danger"; children: ReactNode; icon?: string; dot?: boolean; title?: string; className?: string }) {
  return (
    <span className={cx("chip", `chip-${tone}`, className)} title={title}>
      {dot && <span className="chip-dot" />}
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

// ------------------------------------------------------------------ Skeleton & empty state
export function Skeleton({ w, h = 14, r, style }: { w?: number | string; h?: number | string; r?: number; style?: CSSProperties }) {
  return <span className="skeleton" style={{ width: w ?? "100%", height: h, borderRadius: r, ...style }} />;
}

export function EmptyState({ icon, title, children, actions, compact }: { icon: string; title: string; children?: ReactNode; actions?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx("empty", compact && "empty-compact")}>
      <div className="empty-icon">
        <Icon name={icon} size={compact ? 20 : 24} />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div className="empty-actions">{actions}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ Field helpers
export function Field({ label, hint, children, htmlFor, aside }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string; aside?: ReactNode }) {
  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={htmlFor}>{label}</label>
        {aside}
      </div>
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; id?: string }) {
  return (
    <label className={cx("toggle", disabled && "is-disabled")}>
      <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
      {label && <span className="toggle-label">{label}</span>}
    </label>
  );
}

// ------------------------------------------------------------------ Dialog
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 520,
  dismissable = true,
  className,
  icon,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number | string;
  dismissable?: boolean;
  className?: string;
  icon?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const lastFocus = useRef<Element | null>(null);
  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement;
    const t = setTimeout(() => {
      const el = panel.current?.querySelector<HTMLElement>("[data-autofocus], input:not([type=hidden]):not([disabled]), textarea, select, button.btn-primary");
      (el ?? panel.current)?.focus();
    }, 20);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "Tab" && panel.current) {
        const f = [...panel.current.querySelectorAll<HTMLElement>("a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex='-1'])")].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
      (lastFocus.current as HTMLElement | null)?.focus?.();
    };
  }, [open, dismissable, onClose]);
  if (!open) return null;
  return createPortal(
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && dismissable) onClose();
      }}
    >
      <div ref={panel} className={cx("dialog", className)} style={{ width }} role="dialog" aria-modal="true" aria-labelledby={title ? titleId : undefined} tabIndex={-1}>
        {!title && dismissable && <IconButton icon="x" label="Close" onClick={onClose} className="dialog-close floating" />}
        {title && (
          <div className="dialog-head">
            {icon && (
              <div className="dialog-icon">
                <Icon name={icon} size={18} />
              </div>
            )}
            <div className="dialog-titles">
              {title && <h2 id={titleId}>{title}</h2>}
              {description && <p>{description}</p>}
            </div>
            {dismissable && <IconButton icon="x" label="Close" onClick={onClose} className="dialog-close" />}
          </div>
        )}
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------------ Menu (dropdown)
export interface MenuItem {
  id: string;
  label: ReactNode;
  icon?: string;
  hint?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onSelect: () => void;
  divider?: boolean;
}

export function Menu({ trigger, items, align = "left", width = 240, header }: { trigger: (p: { open: boolean; toggle: () => void; ref: (el: HTMLElement | null) => void }) => ReactNode; items: MenuItem[]; align?: "left" | "right"; width?: number; header?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLElement | null>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const setRef = useCallback((el: HTMLElement | null) => {
    anchor.current = el;
  }, []);

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect();
    let left = align === "right" ? r.right - width : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    const h = pop.current?.offsetHeight ?? 0;
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    setPos({ top, left });
  }, [open, align, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (pop.current?.contains(e.target as Node) || anchor.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        anchor.current?.focus();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        const els = [...(pop.current?.querySelectorAll<HTMLButtonElement>("button.menu-item:not([disabled])") ?? [])];
        const i = els.indexOf(document.activeElement as HTMLButtonElement);
        const n = e.key === "ArrowDown" ? (i + 1) % els.length : (i - 1 + els.length) % els.length;
        els[n]?.focus();
      }
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onScroll);
    setTimeout(() => pop.current?.querySelector<HTMLButtonElement>("button.menu-item:not([disabled])")?.focus(), 10);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  return (
    <>
      {trigger({ open, toggle, ref: setRef })}
      {open &&
        createPortal(
          <div ref={pop} className="menu" style={{ top: pos.top, left: pos.left, width }} role="menu">
            {header && <div className="menu-header">{header}</div>}
            {items.map((it) => (
              <div key={it.id}>
                {it.divider && <div className="menu-divider" />}
                <button
                  type="button"
                  role="menuitem"
                  className={cx("menu-item", it.danger && "is-danger")}
                  disabled={it.disabled || it.loading}
                  onClick={() => {
                    setOpen(false);
                    it.onSelect();
                  }}
                >
                  {it.loading ? <Spinner size={14} /> : it.icon ? <Icon name={it.icon} size={16} /> : <span style={{ width: 16 }} />}
                  <span className="menu-item-text">
                    <span className="menu-item-label">{it.label}</span>
                    {it.hint && <span className="menu-item-hint">{it.hint}</span>}
                  </span>
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

// ------------------------------------------------------------------ Tabs
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: ReactNode; icon?: string; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx("tabs", className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          className={cx("tab", value === t.id && "is-active")}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            const i = tabs.findIndex((x) => x.id === value);
            const n = e.key === "ArrowRight" ? (i + 1) % tabs.length : (i - 1 + tabs.length) % tabs.length;
            onChange(tabs[n].id);
            (e.currentTarget.parentElement?.children[n] as HTMLElement | undefined)?.focus();
          }}
        >
          {t.icon && <Icon name={t.icon} size={15} />}
          {t.label}
          {t.count !== undefined && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, size = "md" }: { options: { id: T; label: ReactNode; title?: string }[]; value: T; onChange: (v: T) => void; size?: "sm" | "md" }) {
  return (
    <div className={cx("segmented", size === "sm" && "segmented-sm")} role="radiogroup">
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={o.id === value} title={o.title} className={cx(o.id === value && "is-active")} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Toasts
type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
}
let toastSeq = 0;
const toastListeners = new Set<(t: ToastItem[]) => void>();
let toastItems: ToastItem[] = [];
function emitToasts() {
  toastListeners.forEach((l) => l(toastItems));
}
function pushToast(kind: ToastKind, title: string, detail?: string, action?: ToastItem["action"]) {
  const t = { id: ++toastSeq, kind, title, detail, action };
  toastItems = [...toastItems.slice(-4), t];
  emitToasts();
  setTimeout(() => dismissToast(t.id), kind === "error" ? 8000 : 4500);
}
function dismissToast(id: number) {
  toastItems = toastItems.filter((t) => t.id !== id);
  emitToasts();
}
export const toast = {
  success: (title: string, detail?: string, action?: ToastItem["action"]) => pushToast("success", title, detail, action),
  error: (title: string, detail?: unknown) => pushToast("error", title, detail instanceof Error ? detail.message : detail !== undefined ? String(detail) : undefined),
  info: (title: string, detail?: string, action?: ToastItem["action"]) => pushToast("info", title, detail, action),
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>(toastItems);
  useEffect(() => {
    toastListeners.add(setItems);
    return () => {
      toastListeners.delete(setItems);
    };
  }, []);
  return createPortal(
    <div className="toaster" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={cx("toast", `toast-${t.kind}`)} role={t.kind === "error" ? "alert" : "status"}>
          <span className="toast-icon">
            <Icon name={t.kind === "success" ? "check" : t.kind === "error" ? "alert" : "info"} size={14} strokeWidth={2.2} />
          </span>
          <div className="toast-body">
            <div className="toast-title">{t.title}</div>
            {t.detail && <div className="toast-detail">{t.detail}</div>}
          </div>
          {t.action && (
            <button
              className="toast-action"
              onClick={() => {
                t.action!.onClick();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="toast-close" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------------ Confirm
interface ConfirmOpts {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}
let confirmSetter: ((s: (ConfirmOpts & { resolve: (v: boolean) => void }) | null) => void) | null = null;
export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    if (!confirmSetter) return resolve(window.confirm(opts.title));
    confirmSetter({ ...opts, resolve });
  });
}

export function ConfirmHost() {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  useEffect(() => {
    confirmSetter = setState;
    return () => {
      confirmSetter = null;
    };
  }, []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <Dialog
      open={!!state}
      onClose={() => close(false)}
      title={state?.title}
      icon={state?.danger ? "alert" : "help"}
      className={state?.danger ? "dialog-danger" : undefined}
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant={state?.danger ? "danger" : "primary"} onClick={() => close(true)} data-autofocus>
            {state?.confirmLabel ?? "Confirm"}
          </Button>
        </>
      }
    >
      {state?.message && <div className="confirm-message">{state.message}</div>}
    </Dialog>
  );
}

// ------------------------------------------------------------------ misc
export function useElapsed(running: boolean): number {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!running) {
      setS(0);
      return;
    }
    const t0 = Date.now();
    const t = setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 250);
    return () => clearInterval(t);
  }, [running]);
  return s;
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="copy-btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
      aria-label={label}
      title={label}
    >
      <Icon name={done ? "check" : "copy"} size={14} />
    </button>
  );
}

export function LangPills({ langs, max = 4, active }: { langs: string[]; max?: number; active?: Set<string> }) {
  const shown = langs.slice(0, max);
  return (
    <span className="lang-pills">
      {shown.map((l, i) => (
        <span key={l} className={cx("lang-pill", i === 0 && "is-source", active && !active.has(l) && "is-missing")} title={i === 0 ? `${l.toUpperCase()} (source)` : l.toUpperCase()}>
          {l.toUpperCase()}
        </span>
      ))}
      {langs.length > max && <span className="lang-pill is-more">+{langs.length - max}</span>}
    </span>
  );
}

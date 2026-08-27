import { VIEW_W, VIEW_H, SUPER } from './Viewport.js';

const STORAGE_KEY = 'elemental-td:scale';
const BAR_STORAGE_KEY = 'elemental-td:show-size-bar';

const dpr = () => (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

const CLEAN_SCALES = (() => {
    const out = [];
    for (let divisor = 1; divisor <= SUPER; divisor++) {
        if (SUPER % divisor === 0) out.push(SUPER / divisor);
    }
    return out; // [4, 2, 1] for SUPER 4
})();

class DisplaySystem {
    constructor() {
        this.game = null;
        this._listeners = new Set();
    }

    init(game) {
        this.game = game;
        this._syncBottomBar();
    }

    onChange(fn) {
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }

    _notify() {
        for (const fn of this._listeners) {
            try { fn(); } catch (e) { console.error(e); }
        }
    }

    maxScale() {
        if (typeof window === 'undefined') return 2;
        const reserveX = window.innerWidth <= 768 ? 8 : 24;
        const reserveY = this.isBottomBarVisible() ? 64 : (window.innerHeight <= 600 ? 8 : 24);
        const availW = Math.max(100, window.innerWidth - reserveX);
        const availH = Math.max(100, window.innerHeight - reserveY);
        return Math.min(
            (availW * dpr()) / VIEW_W,
            (availH * dpr()) / VIEW_H
        );
    }

    crispScale() {
        const max = this.maxScale();
        return CLEAN_SCALES.find(s => s <= max + 1e-6) ?? max;
    }

    quantize(scale) {
        return Math.round(VIEW_W * scale) / VIEW_W;
    }

    isClean(scale) {
        return CLEAN_SCALES.some(s => Math.abs(s - scale) < 0.005);
    }

    getStoredScale() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const n = parseFloat(raw);
            return Number.isFinite(n) && n > 0 ? n : null;
        } catch {
            return null;
        }
    }

    setStoredScale(scale) {
        try {
            if (scale === null) localStorage.removeItem(STORAGE_KEY);
            else localStorage.setItem(STORAGE_KEY, String(scale));
        } catch {}
    }

    getEffectiveScale() {
        const stored = this.getStoredScale();
        return this.quantize(Math.min(stored ?? this.crispScale(), this.maxScale()));
    }

    applyScale(scale) {
        if (!this.game) return;
        const zoom = scale / (SUPER * dpr());
        if (Math.abs(this.game.scale.zoom - zoom) > 1e-6) {
            this.game.scale.setZoom(zoom);
        }
        if (this.game.canvas) {
            this.game.canvas.classList.toggle('crisp', Math.abs(scale - SUPER) < 1e-6);
        }
    }

    setScale(scale) {
        const clamped = Math.max(0.1, Math.min(scale, this.maxScale()));
        const quantized = this.quantize(clamped);
        this.setStoredScale(quantized);
        this.applyScale(quantized);
        this._notify();
    }

    setCrisp() {
        this.setStoredScale(null);
        const scale = this.getEffectiveScale();
        this.applyScale(scale);
        this._notify();
    }

    setFill() {
        const max = this.maxScale();
        this.setStoredScale(max);
        this.applyScale(this.quantize(max));
        this._notify();
    }

    isBottomBarVisible() {
        try {
            const raw = localStorage.getItem(BAR_STORAGE_KEY);
            // Default to false (hidden) so canvas is clean and bar is in options
            if (raw === null) return false;
            return raw === 'true';
        } catch {
            return false;
        }
    }

    setBottomBarVisible(visible) {
        try {
            localStorage.setItem(BAR_STORAGE_KEY, visible ? 'true' : 'false');
        } catch {}
        this._syncBottomBar();
        this._notify();
    }

    toggleBottomBar() {
        const current = this.isBottomBarVisible();
        this.setBottomBarVisible(!current);
        return !current;
    }

    _syncBottomBar() {
        if (typeof document === 'undefined') return;
        const bar = document.getElementById('size-bar');
        if (bar) {
            bar.style.display = this.isBottomBarVisible() ? 'flex' : 'none';
        }
    }

    getInfo() {
        const scale = this.getEffectiveScale();
        const w = Math.round(VIEW_W * scale);
        const h = Math.round(VIEW_H * scale);
        const clean = this.isClean(scale);
        const ratio = SUPER / scale;
        return {
            scale,
            width: w,
            height: h,
            isClean: clean,
            ratio: Math.round(ratio),
            label: clean
                ? `${w}x${h} (${scale.toFixed(2)}x Nítido)`
                : `${w}x${h} (${scale.toFixed(2)}x Interpolado)`,
            bottomBarVisible: this.isBottomBarVisible(),
        };
    }
}

export const display = new DisplaySystem();

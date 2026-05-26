/* extension.js — Battery Charge Limit Quick Settings Slider (GNOME 50) */

'use strict';

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {QuickSlider} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const QSButton = Main.panel.statusArea.quickSettings;
const QSMenu = QSButton.menu;

const CHARGE_THRESHOLD_PATH = '/sys/class/power_supply/BAT0/charge_control_end_threshold';
const HELPER = '/usr/local/bin/batlimit-set';

/* ───────────────────────────────────────────────
 * Write charge threshold via sudo (NOPASSWD configured)
 * ─────────────────────────────────────────────── */
function _writeThreshold(value) {
    const pct = Math.round(value);
    try {
        const [ok, stdout, stderr] = GLib.spawn_command_line_sync(
            `sudo -n ${HELPER} ${pct}`);
        if (!ok) {
            log(`batlimit: sudo failed — stdout="${stdout}" stderr="${stderr}"`);
        } else {
            log(`batlimit: wrote ${pct}%`);
        }
    } catch (e) {
        logError(e, 'batlimit: spawn failed');
    }
}

function _readThreshold() {
    try {
        const [ok, content] = GLib.file_get_contents(CHARGE_THRESHOLD_PATH);
        if (!ok)
            return 100;
        return parseInt(String.fromCharCode(...content).trim(), 10) || 100;
    } catch (e) {
        return 100;
    }
}

const DEBOUNCE_MS = 400; // ms after last slider movement before writing to sysfs

/* ───────────────────────────────────────────────
 * The slider widget that goes in Quick Settings
 * ─────────────────────────────────────────────── */
const BatlimitSlider = GObject.registerClass(
class BatlimitSlider extends QuickSlider {
    _init(settings) {
        super._init({
            iconName: 'battery-level-charging-symbolic',
            iconReactive: true,
            iconLabel: 'Battery Charge Limit',
        });

        this._settings = settings;
        this._debounceId = 0;

        this.slider.accessible_name = 'Battery Charge Limit';

        // ── Add percentage label between icon and slider ──
        this._percentLabel = new St.Label({
            text: '80%',
            style_class: 'batlimit-percent-label',
            y_align: Clutter.ActorAlign.CENTER,
        });
        const box = this.get_child();
        box.insert_child_at_index(this._percentLabel, 1);

        // ── Debounced sysfs write on slider drag ──
        this.slider.connectObject('notify::value', () => {
            const pct = Math.round(this.slider.value * 100);
            this._settings.set_double('charge-limit', pct);
            this._percentLabel.text = `${pct}%`;

            // Restart debounce timer — read fresh value on fire
            if (this._debounceId)
                GLib.source_remove(this._debounceId);
            this._debounceId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT, DEBOUNCE_MS, () => {
                    _writeThreshold(Math.round(this.slider.value * 100));
                    this._debounceId = 0;
                    return GLib.SOURCE_REMOVE;
                });
        }, this);

        // ── Write immediately when user releases the slider ──
        this.slider.connectObject('drag-end', () => {
            if (this._debounceId) {
                GLib.source_remove(this._debounceId);
                this._debounceId = 0;
            }
            _writeThreshold(Math.round(this.slider.value * 100));
        }, this);

        // ── Sync gsettings → slider ──
        this._settings.connectObject(
            `changed::charge-limit`,
            () => this._sync(),
            this,
        );

        // ── Defer initial sync so the slider widget is fully allocated ──
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._sync();
            return GLib.SOURCE_REMOVE;
        });
    }

    _sync() {
        const limit = this._settings.get_double('charge-limit');
        this.slider.value = Math.min(limit / 100, 1);
        this._percentLabel.text = `${Math.round(limit)}%`;
    }

    vfunc_destroy() {
        if (this._debounceId) {
            GLib.source_remove(this._debounceId);
            this._debounceId = 0;
        }
        super.vfunc_destroy();
    }
});

/* ───────────────────────────────────────────────
 * Extension entry point
 * ─────────────────────────────────────────────── */
export default class BatlimitExtension extends Extension {
    enable() {
        try {
            this._settings = this.getSettings();

            // Read current hardware state and sync settings
            const hwLimit = _readThreshold();
            this._settings.set_double('charge-limit', hwLimit);

            this._slider = new BatlimitSlider(this._settings);

            // Insert in the grid after the brightness slider.
            const brightnessItem =
                QSButton._brightness?.quickSettingsItems?.[0];

            if (brightnessItem) {
                let insertBefore = null;
                let child = brightnessItem.get_next_sibling();
                while (child) {
                    if (child instanceof St.Button ||
                        child instanceof St.Widget) {
                        insertBefore = child;
                        break;
                    }
                    child = child.get_next_sibling();
                }

                if (insertBefore)
                    QSMenu.insertItemBefore(this._slider, insertBefore, 2);
                else
                    QSMenu.addItem(this._slider, 2);
            } else {
                QSMenu.addItem(this._slider, 2);
            }
        } catch (e) {
            logError(e, 'batlimit: enable failed');
        }
    }

    disable() {
        this._settings?.disconnectObject(this);

        this._slider?.destroy();
        this._slider = null;

        this._settings = null;
    }
}

/* prefs.js — Preferences dialog for batlimit */

'use strict';

import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const CHARGE_THRESHOLD_PATH = '/sys/class/power_supply/BAT0/charge_control_end_threshold';
const HELPER = '/usr/local/bin/batlimit-set';
const DEBOUNCE_MS = 400;
const POLL_MS = 2000;

export default class BatlimitPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(450, 400);
        window.set_search_enabled(false);
        window.set_title('Battery Charge Limit');

        const settings = this.getSettings();
        let debounceId = 0;

        // ── Main page ──
        const page = new Adw.PreferencesPage();
        window.add(page);

        // ── Charge limit group ──
        const limitGroup = new Adw.PreferencesGroup({
            title: 'Charge Limit',
            description: 'Set the maximum battery charge level to prolong battery lifespan.',
        });
        page.add(limitGroup);

        // Scale row
        const limitRow = new Adw.ActionRow({
            title: 'Charge Limit',
            subtitle: 'Percentage of maximum charge',
        });

        const scale = Gtk.Scale.new_with_range(
            Gtk.Orientation.HORIZONTAL, 0, 100, 5);
        scale.set_hexpand(true);
        scale.set_digits(0);
        scale.set_value_pos(Gtk.PositionType.RIGHT);
        scale.set_size_request(250, -1);

        // Show current value as formatted label
        const valueLabel = new Gtk.Label({
            label: '80%',
            css_classes: ['heading'],
            width_chars: 4,
        });

        const scaleBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 8,
        });
        scaleBox.append(scale);
        scaleBox.append(valueLabel);
        limitRow.add_suffix(scaleBox);

        limitGroup.add(limitRow);

        // ── Sync GSettings → scale + label ──
        const limit = settings.get_double('charge-limit');
        scale.set_value(limit);
        valueLabel.set_label(`${Math.round(limit)}%`);

        // ── Debounced write on value change ──
        scale.connect('value-changed', () => {
            const pct = Math.round(scale.get_value());
            settings.set_double('charge-limit', pct);
            valueLabel.set_label(`${pct}%`);
            currentRow.set_subtitle(`${pct}%`);

            if (debounceId)
                GLib.source_remove(debounceId);
            debounceId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT, DEBOUNCE_MS, () => {
                    _writeThreshold(Math.round(scale.get_value()));
                    debounceId = 0;
                    return GLib.SOURCE_REMOVE;
                });
        });

        // ── Hardware info ──
        const infoGroup = new Adw.PreferencesGroup();
        page.add(infoGroup);

        const currentRow = new Adw.ActionRow({
            title: 'Current hardware value',
            subtitle: '',
        });
        const hwValue = _readThreshold();
        currentRow.set_subtitle(`${hwValue}%`);
        infoGroup.add(currentRow);

        const pathRow = new Adw.ActionRow({
            title: 'Sysfs path',
            subtitle: CHARGE_THRESHOLD_PATH,
        });
        infoGroup.add(pathRow);

        // ── Poll GSettings + hardware every 2s ──
        let lastGs = settings.get_double('charge-limit');
        let pollId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, POLL_MS, () => {
                const gs = settings.get_double('charge-limit');
                const hw = _readThreshold();
                currentRow.set_subtitle(`${hw}%`);

                // Sync scale from GSettings (catches extension changes)
                if (gs !== lastGs) {
                    lastGs = gs;
                    scale.set_value(gs);
                    valueLabel.set_label(`${Math.round(gs)}%`);
                }
                return GLib.SOURCE_CONTINUE;
            });

        // ── Clean up on close ──
        window.connect('close-request', () => {
            if (debounceId) {
                GLib.source_remove(debounceId);
                debounceId = 0;
            }
            if (pollId) {
                GLib.source_remove(pollId);
                pollId = 0;
            }
        });
    }
}

function _writeThreshold(value) {
    const pct = Math.round(value);
    try {
        GLib.spawn_command_line_async(
            `sudo -n ${HELPER} ${pct}`);
    } catch (e) {
        logError(e, 'batlimit: prefs write failed');
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

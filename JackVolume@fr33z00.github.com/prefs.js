/*******************************************************************************
MIT License

Copyright (c) 2016 fr33z00

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Author fr33z00
******************************************************************************

This file is part of JackVolume Gnome extension

It creates the Preference interface

Feel free to improve this code as I'm not an experienced software programmer.

*/

const GObject = imports.gi.GObject;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;

const ExtensionUtils = imports.misc.extensionUtils;

const Gettext = imports.gettext;
const _ = Gettext.gettext;

const jackVolumeInterface = '<node>\
<interface name="org.freedesktop.jackvolume"> \
    <method name="listMidiPorts"> \
        <arg type="s" direction="out"/> \
    </method> \
</interface> \
</node>';

const jackVolumeProxy = Gio.DBusProxy.makeProxyWrapper(jackVolumeInterface);
let portsList;

function init() {
    function listFilter(element, index, caller) {
       if (index%2) return element;
    }
    let user_locale_path = ExtensionUtils.getCurrentExtension().path + "/locale";
    Gettext.bindtextdomain("JackVolume", user_locale_path);
    Gettext.textdomain("JackVolume");
    try {
        let proxy = new jackVolumeProxy(Gio.DBus.session, 'org.freedesktop.jackvolume','/org/freedesktop/jackvolume');
        portsList = proxy.listMidiPortsSync();
    } catch(e) {
        log("DBus access to daemon unsuccessful");
    }
    if (portsList)
        portsList = portsList[0].split("'").filter(listFilter);
    else
        portsList = ["Run jack and enable extension to get list"];
}

const JackVolumePrefsWidget = new GObject.Class({
    Name: 'JackVolume.Prefs.Widget',
    GTypeName: 'JackVolumePrefsWidget',
    Extends: Gtk.Grid,

    _init: function(params) {
	      this.parent(params);
        this.margin = 20;
	      this._settings = this._get_settings();

        let frame = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});

        let audio_setting = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL,
            margin_left: 10,
            margin_top: 5,
            margin_bottom: 5,
            margin_right: 10
            });

        let label = new Gtk.Label({label: Gettext.gettext("Create Audio ports"), xalign: 0, yalign: 0.5, hexpand: true});
        audio_setting.add(label);

	      let switcher = new Gtk.Switch ({halign: Gtk.Align.END});
	      this._settings.bind("audio", switcher, "active", Gio.SettingsBindFlags.DEFAULT);
        audio_setting.add(switcher);
        

        let link_setting = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL,
            margin_left: 30,
            margin_top: 5,
            margin_bottom: 5,
            margin_right: 10
            });

        label = new Gtk.Label({label: Gettext.gettext("Link jack and global sliders"), xalign: 0, yalign: 0.5, hexpand: true});
        link_setting.add(label);

	      switcher = new Gtk.Switch ({halign: Gtk.Align.END});
	      this._settings.bind("link", switcher, "active", Gio.SettingsBindFlags.DEFAULT);
        link_setting.add(switcher);
        this._settings.bind('audio', link_setting, 'sensitive', Gio.SettingsBindFlags.DEFAULT);


        let midi_setting = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});

        let midi_enabler = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL,
            margin_left: 10,
            margin_top: 5,
            margin_bottom: 5,
            margin_right: 10
            });

        label = new Gtk.Label({label: Gettext.gettext("Create Midi port"), xalign: 0, yalign: 0.5, hexpand: true});
        midi_enabler.add(label);

	      switcher = new Gtk.Switch ({halign: Gtk.Align.END});
	      this._settings.bind("midi", switcher, "active", Gio.SettingsBindFlags.DEFAULT);
        midi_enabler.add(switcher);

        midi_setting.add(midi_enabler);

        let midi_port = new Gtk.Box({orientation: Gtk.Orientation.HORIZONTAL,
            margin_left: 30,
            margin_top: 5,
            margin_bottom: 5,
            margin_right: 10
            });

        label = new Gtk.Label({label: Gettext.gettext("Midi port to connect to"), xalign: 0, yalign: 0.5, hexpand: true});
        midi_port.add(label);

          let list = new Gtk.ComboBoxText({margin_left:10, halign:Gtk.Align.END});
          let active_idx = 0;
          for (let i = 0; i < portsList.length; i++) {
              list.append_text(portsList[i].length > 43 ? portsList[i].substr(0,40)+"..." : portsList[i]);
              if (this._settings.get_string("port") == portsList[i])
                  active_idx = i;
          }
          list.set_active(active_idx);
          list.connect('changed', Lang.bind(this, function(widget) {
              this._settings.set_string("port", portsList[widget.get_active()]);
          }));

        midi_port.add(list);
        this._settings.bind('midi', midi_port, 'sensitive', Gio.SettingsBindFlags.DEFAULT);
        
        midi_setting.add(midi_port);

        frame.add(audio_setting);
        frame.add(link_setting);
        frame.add(midi_setting);

        this.add(frame);

    },

    _get_settings: function () {
	      let schema_id = "org.gnome.shell.extensions.JackVolume";
	      let schema_path = ExtensionUtils.getCurrentExtension().path + "/schemas";
	      let schema_source = Gio.SettingsSchemaSource.new_from_directory(
                            schema_path,
									          Gio.SettingsSchemaSource.get_default(),
									          false);
	      if (!schema_source) {
            throw new Error("Local schema directory for " + schema_id + " is missing");
	      }
	      let schema = schema_source.lookup(schema_id, true);
	      if (!schema) {
            throw new Error("Schema " + schema_id + " is missing.  Has glib-compile-schemas been called for it?");
	      }
	      return new Gio.Settings({settings_schema: schema});
    }
});

function buildPrefsWidget() {
    let widget = new JackVolumePrefsWidget();
    widget.show_all();
    return widget;
}


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

It creates a slider in the global menu to manage Jack Audio Connection Kit
global volume.
It offers 2 ways to manage the volume :
- an audio port that is automatically connected to system output
- an midi port to be used with a JACK mixer like jack-mixer

It also offers to link the Jack slider to the global volume slider.

As audio is managed in Python, it may not be optimal. If you experience
XRuns or glitches, prefer the Midi + jack-mixer way.

Feel free to improve this code as I'm not a much experienced software
programmer.

*/

const Lang = imports.lang;
const Clutter = imports.gi.Clutter;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Prefs = Me.imports.prefs;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const PopupMenu = imports.ui.popupMenu;
const Slider = imports.ui.slider;
const St = imports.gi.St;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Signals = imports.signals;

// DBus interface of Python daemon
const jackVolumeInterface = '<node>\
<interface name="org.freedesktop.jackvolume"> \
    <method name="setPortName"> \
        <arg name="p" type="s" direction="in"/> \
    </method> \
    <method name="getPortName"> \
    </method> \
    <method name="getVolume"> \
        <arg type="i" direction="out"/> \
    </method> \
    <method name="registerMidiPort"> \
    </method> \
    <method name="unregisterMidiPort"> \
    </method> \
    <method name="connectMidiPort"> \
    </method> \
    <method name="disconnectMidiPort"> \
    </method> \
    <method name="registerAudioPorts"> \
    </method> \
    <method name="unregisterAudioPorts"> \
    </method> \
    <method name="connectAudioPorts"> \
    </method> \
    <method name="disconnectAudioPorts"> \
    </method> \
    <method name="Quit"> \
    </method> \
    <method name="listMidiPorts"> \
        <arg type="s" direction="out"/> \
    </method> \
    <method name="startClient"> \
    </method> \
    <method name="setVolume"> \
        <arg name="v" type="i" direction="in"/> \
    </method> \
    <signal name="connected"> \
    </signal> \
</interface> \
</node>';

const jackControlInterface = '<node>\
<interface name="org.jackaudio.JackControl"> \
    <signal name="ServerStarted"> \
    </signal> \
    <signal name="ServerStopped"> \
    </signal> \
</interface> \
</node>';

const jackVolumeProxy = Gio.DBusProxy.makeProxyWrapper(jackVolumeInterface);
const jackServiceProxy = Gio.DBusProxy.makeProxyWrapper(jackControlInterface);
let jvProxy;
let jsProxy;

let path;
let JackSliderInstance = null;
let settings;
let connectedId;
let ServerStoppedId;
let ServerStartedId;
let linkId;
let midiId;
let audioId;
let portId;
let watchId;

// define a slider class, basically a copy of the system slider, adapted to our needs
const JackSlider = new Lang.Class({
    Name: 'JackSlider',

    _init: function(control) {

        this.control = control;
        this.linked = false;

        this.item = new PopupMenu.PopupBaseMenuItem({ activate: false });

        this._slider = new Slider.Slider(0);
        this._slider.connect('value-changed', Lang.bind(this, this._sliderChanged));
        this._slider.connect('drag-end', Lang.bind(this, this._notifyVolumeChange));
        this._slider.actor.accessible_name = _("Jack Volume");

        this._icon = new St.Icon({ style_class: 'popup-menu-icon' });
        this._icon.icon_name = ('jack-volume');

        this.item.actor.add(this._icon);
        this.item.actor.add(this._slider.actor, { expand: true });
        this.item.actor.connect('button-press-event', Lang.bind(this, function(actor, event) {
              return this._slider.startDragging(event);
        }));
        this.item.actor.connect('key-press-event', Lang.bind(this, function(actor, event) {
              return this._slider.onKeyPressEvent(actor, event);
        }));
        this.control.addMenuItem(this.item);
	// events connections Ids
        this.controlSliderChangedId;
        this.sliderChangedId;
        this.controlStreamUpdatedId;
    },

    // the function to link the slider to the global volume slider
    link: function() {
        if (this.linked)
            return;
        this.linked = true;
        // set the slider to the global volume value
        this.setValue(this.control._output._slider.value);
        // interconnect sliders
        this.controlSliderChangedId = this.control._output._slider.connect('value-changed', Lang.bind(this, this._sliderChanged));
        this.sliderChangedId = this._slider.connect('value-changed', Lang.bind(this.control._output, this.control._output._sliderChanged));
        // connect to general stream updated event (to react to changes made in Pulseaudio)
        this.controlStreamUpdatedId = this.control._output.connect('stream-updated', Lang.bind(this, this._streamVolumeUpdate));
    },

    _streamVolumeUpdate: function() {
        if (this.linked)
            this._sliderChanged(this, this.control._output._slider._value);
    },

    // to function to unlink sliders
    unlink: function() {
        if (!this.linked)
            return;
        this.linked = false;
        // clear events connections
        this._slider.disconnect(this.sliderChangedId);
        this.control._output._slider.disconnect(this.controlSliderChangedId);
        this.control._output.disconnect(this.controlStreamUpdatedId);
    },

    _shouldBeVisible: function() {
        return true;
    },

    _updateVisibility: function() {
        let visible = this._shouldBeVisible();
        this.item.actor.visible = visible;
    },

    scroll: function(event) {
        return this._slider.scroll(event);
    },

    setValue: function(value) {
        this._slider.setValue(value);
    },

    _sliderChanged: function(slider, value, property) {
        let volume = (value * 127)>>0;
        settings.set_int("volume", volume);
        // send the volume value to the Python daemon
        jvProxy.setVolumeSync(volume);
        this.setValue(value);
    },

    _notifyVolumeChange: function() {
        global.cancel_theme_sound(VOLUME_NOTIFY_ID);
        global.play_theme_sound(VOLUME_NOTIFY_ID,
                                'audio-volume-change',
                                _("Volume changed"),
                                Clutter.get_current_event ());
    },

    getIcon: function() {
        let volume = jvProxy.getVolumeSync()/127;
        if (volume <= 0) {
            return 'audio-volume-muted-symbolic';
        } else {
            let n = Math.floor(3 * volume) + 1;
            if (n < 2)
                return 'audio-volume-low-symbolic';
            if (n >= 3)
                return 'audio-volume-high-symbolic';
            return 'audio-volume-medium-symbolic';
        }
    },

    destroy: function () {
        if (this.linked)
            this.unlink();
        this.item.destroy();
    }
});
Signals.addSignalMethods(JackSlider.prototype);

// function to retrieve settings
function get_settings() {
    let schema_id = "org.gnome.shell.extensions.JackVolume";
    let schema_path = ExtensionUtils.getCurrentExtension().path + "/schemas";
    let schema_source = Gio.SettingsSchemaSource.new_from_directory(schema_path,
                        Gio.SettingsSchemaSource.get_default(),
							          false);
    if (!schema_source) {
            throw new Error("Local schema directory for " + schema_id + " is missing");
    }
    let schema = schema_source.lookup(schema_id, true);
    if (!schema) {
            throw new Error("Schema " + schema_id + " is missing. Has glib-compile-schemas been called for it?");
    }
    return new Gio.Settings({settings_schema: schema});
}

// function to send the configuration to the Python daemon through DBus
function config() {
    let audio = settings.get_boolean("audio");
    let midi = settings.get_boolean("midi");
    if (audio)
        jvProxy.registerAudioPortsSync();
    else
        jvProxy.unregisterAudioPortsSync();
    if (midi)
        jvProxy.registerMidiPortSync();
    else
        jvProxy.unregisterMidiPortSync();

    if (audio)
        jvProxy.connectAudioPortsSync();
    else
        jvProxy.disconnectAudioPortsSync();

    if (midi) {
        let port = settings.get_string("port");
        if (port.indexOf(":") > 0) {
            jvProxy.setPortNameSync(port);
            jvProxy.connectMidiPortSync();
        }
    }
    else
        jvProxy.disconnectMidiPortSync();
}

function link_unlink () {
    if (settings.get_boolean("link"))
        JackSliderInstance.link();
    else
        JackSliderInstance.unlink();
}

function createSlider() {
    let _volumeMenu = Main.panel.statusArea.aggregateMenu._volume._volumeMenu;
    if (JackSliderInstance == null) {
        // set the volume to its last value (in case it is not linked to system volume)
        let volume = settings.get_int("volume");
        jvProxy.setVolumeSync(volume);
        JackSliderInstance = new JackSlider(_volumeMenu);
    }

    config();
    link_unlink();
}

function connectedCallback(emitter, something, params) {
    // create the slider
    createSlider();
}

function serverStoppedCallback(emitter, something, params) {
    JackSliderInstance.destroy();
    JackSliderInstance = null;
    Main.notify('Jack server stopped');
}

function serverStartedCallback(emitter, something, params) {
    // start the jack client
    jvProxy.startClientSync();
}

function nameExists() {
    // connect to JackVolume daemon
    jvProxy = new jackVolumeProxy(Gio.DBus.session, 'org.freedesktop.jackvolume','/org/freedesktop/jackvolume');
    connectedId = jvProxy.connectSignal('connected', connectedCallback);
    // start the jack client
    jvProxy.startClientSync();
}

function nameUnknown() {
    // if we are here, python daemon was not launched or died, so (re)launch it
    GLib.spawn_command_line_async('python3 ' + path + '/jackVolume.py');
}

function init(Metadata) {
    let theme = imports.gi.Gtk.IconTheme.get_default();
    theme.append_search_path(Metadata.path);
    path = Metadata.path;
    settings = get_settings();
}

function enable() {
    // watch the Python daemon name on Dbus.
    watchId = Gio.bus_watch_name(2, 'org.freedesktop.jackvolume', 0, nameExists, nameUnknown);
    // connect to jackDbus
    jsProxy = new jackServiceProxy(Gio.DBus.session, 'org.jackaudio.service','/org/jackaudio/Controller');
    ServerStoppedId = jsProxy.connectSignal('ServerStopped', serverStoppedCallback);
    ServerStartedId = jsProxy.connectSignal('ServerStarted', serverStartedCallback);
    // connect to settings panel
    linkId = settings.connect("changed::link", link_unlink);
    audioId = settings.connect("changed::audio", function(){config()});
    midiId = settings.connect("changed::midi", function(){config()});
    portId = settings.connect("changed::port", function(){config()});
}

function disable() {
    // disconnect DBus signals
    if (connectedId)
        jvProxy.disconnectSignal(connectedId);
    if (ServerStoppedId)
        jsProxy.disconnectSignal(ServerStoppedId);
    if (ServerStartedId)
        jsProxy.disconnectSignal(ServerStartedId);
    if (watchId)
        Gio.bus_unwatch_name(watchId);
    // disconnect settings
    if (linkId)
        settings.disconnect(linkId);
    if (audioId)
        settings.disconnect(audioId);
    if (midiId)
        settings.disconnect(midiId);
    if (portId)
        settings.disconnect(portId);
    // kill the daemon
    jvProxy.QuitSync();
    // destroy slider
    JackSliderInstance.destroy();
    JackSliderInstance = null;
}

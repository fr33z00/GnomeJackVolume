# GnomeJackVolume
A jack global volume extension for Gnome 

If you've always been frustrated that Jack Audio Connection Kit (JACK) doesn't allow the quick access (slider / keyboard shortcuts) to global output volume we are used to with Pulseaudio (or many other OSes), this Gnome extension is for you.

![Alt text](jackVolume.png?raw=true "Title")

Requirements
------------

- Gnome 3.20/3.22 (other versions untested, but may work from 3.16. Needs metadata.json edition)
- JackDbus
- Python3.x
- jack-client (https://pypi.python.org/pypi/JACK-Client)

Optionnaly:
- jack-mixer
- QjackCtl
-JackConnect (https://github.com/fr33z00/GnomeJackConnect)

Installation
------------

- Clone somewhere
```
git clone https://github.com/fr33z00/GnomeJackVolume
```
- Copy/move to your local gnome extension folder
```
mv GnomeJackVolume/JackVolume@fr33z00.github.com ~/.local/share/gnome-shell/extensions/
```

- Enable the extension 
```
gnome-shell-extension-tool -e JackVolume@fr33z00.github.com
```
- Finally, restart gnome-shell with Alt+F2 r (Enter)

For required/optionnal software installation, please refer to their respective documentations.

Usage
-----

You get a new slider in the system popup menu, as in the above screenshot. You can now tune the settings in the preference panel through gnome-tweak-tool or
```
gnome-shell-extension-prefs
```
Depending on your settings, you will get new audio and/or MIDI ports named gnome-shell.

Audio port output will directly connect to your system playback port (the same number of channels are created).
You will need to configure your applications to connect to the new created gnome-shell port, but I guess you know how to do that, since you are a JACK user.

MIDI port will connect to the port selected in the preference panel. It is intended to be used with a mixer like jack-mixer. It sends a Control Change 7 message on MIDI channel 0.

If you experience XRuns with Audio port and if it is critical for you, use MIDI. This is because audio is managed in python, which is not the best way to get a realtime system.

If you use pulseaudio with a jack-sink, you may also link the slider to pulseaudio one. This allows to control both systems at a time (and any keyboard shortcut). This is obvious, but leave jack-sink connected to system playback port.

Note
----

If not already running, jack server will be started by the extension. If for any reason you stop the server, the extension will wait until you restart it to recreate the ports.

Enjoy!

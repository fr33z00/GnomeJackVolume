# GnomeJackVolume
A jack global volume extension for Gnome 

If you've always been frustrated that Jack Audio Connection Kit (JACK) doesn't allow the quick access (slider / keyboard shortcuts) to global output volume we are used to with Pulseaudio (or many other OSes), this Gnome extension is for you.

![Alt text](jackVolume.png?raw=true "Title")

Requirements
============

Gnome 3.20 (other versions untested, but may work from 3.16 and above. Needs metadata.json edition)
Jack (1 or 2)
Python3.x
jack-client (python-jack-client package in ubuntu)

Optionnaly:
jack-mixer
QjackCtl

Installation
============

Clone somewhere and copy/move JackVolume@fr33z00.github.com directory into /home/user/.local/share/gnome-shell/extensions

Restart gnome-shell (Alt+F2 r Enter) 
Enable the extension (gnome-shell-extension-prefs in a terminal, or through gnome-tweak-tool)

Usage
=====

Once enabled, you get a new slider in the system popup menu.
Depending on the settings you choose in extension preference panel (again, gnome-shell-extension-prefs in a terminal, or through gnome-tweak-tool), you will get new audio and/or MIDI ports named gnome-shell.

Audio port output will directly connect to your system playback port (the same number of channels are created).
You will need to configure your applications to connect to the new created gnome-shell port, but I guess you know how to do that, since you are a JACK user.

MIDI port will connect to the MIDI port selected in the preference panel. It is intended to be used with a mixer like jack-mixer. It sends a Control Change 7 message on MIDI channel 0.

If you experience XRuns with Audio port and if it is critical for you, use MIDI. This is because audio is managed in python, which is not the best way to get a realtime system.

If you use pulseaudio with a jack-sink, you may also link the slider to pulseaudio one. This allows to control both systems at a time (and any keyboard shortcut). This is obvious, but leave jack-sink connected to system playback port.

Enjoy!

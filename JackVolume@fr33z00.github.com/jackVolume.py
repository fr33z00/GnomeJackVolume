#!/usr/bin/python3
################################################################################
# MIT License
# 
# Copyright (c) 2016 fr33z00
# 
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
#
# Author: fr33z00
################################################################################
# 
# This file is part of JackVolume Gnome extension
# A daemon that creates Audio/MIDI JACK ports and a DBus interface
# requires python3 (python-)jack-client

# Feel free to improve this code as I'm not an experiences software programmer.


import sys, getopt, jack, struct, time, math, dbus, dbus.service
from dbus.mainloop.glib import DBusGMainLoop
import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk

volume = 100
audiovolume = (100/127) ** 5
midiport = []
inports = []
outports = []
client = ''
portname = ''
systemports = []
kill = 0
debug = 1

def dbgPrint(s):
    if debug == 1:
        print(s)

class jvDbusService(dbus.service.Object):
    def __init__(self):
        bus = dbus.SessionBus()
        obj = 0
        try:
            bus.get_object('org.freedesktop.jackvolume', '/org/freedesktop/jackvolume')
            dbgPrint("dbus service already running, exiting")
            obj = 1
        except:
            dbgPrint("starting dbus service")

        if obj == 1:
            sys.exit()

        bus_name = dbus.service.BusName('org.freedesktop.jackvolume', bus)
        dbus.service.Object.__init__(self, bus_name, '/org/freedesktop/jackvolume')
        dbgPrint("dbus service started")

    @dbus.service.signal(dbus_interface='org.freedesktop.jackvolume')
    def connected(self):
        """emit a signal to inform of client connected to jack """
        dbgPrint("signal 'connected' emitted ")
        return

    @dbus.service.method(dbus_interface='org.freedesktop.jackvolume')
    def startClient(self):
        """starts interfaces"""
        global systemports
        if client != '':
            try:
                client.deactivate()
                client.close()
            except:
                dbgPrint("")

        dbgPrint("starting jack client")

        def create_client():
            global client
            global midiport
            global inports
            global outports
            try:
                client = jack.Client("gnome-shell")
                midiport = []
                inports = []
                outports = []
            except:
                dbgPrint("could not create client, retry in 2s")
                time.sleep(2)
                if kill == 0:
                    create_client()

        create_client()
        dbgPrint("client created")

        # jack shutdown callback
        @client.set_shutdown_callback
        def shutdown(status, reason):
            global client
            global midiport
            global inports
            global outports
            client = ''
            midiport = []
            inports = []
            outports = []

        # jack process callback
        @client.set_process_callback
        def process(frames):
          # manage midi
          if midiport != [] and midiport[0].connections != []:
              midiport[0].clear_buffer()
              midiport[0].write_midi_event(0,struct.pack('3B',0xB0,7,volume))
          # manage audio
          for i, o in zip(inports, outports):
              ibuf = memoryview(i.get_buffer()).cast('f')
              obuf = memoryview(o.get_buffer()).cast('f')
              for x in range(len(ibuf)):
                  obuf[x] = ibuf[x]*audiovolume

        # activate the client (once the callback is installed)
        client.activate()
        # get the system audio ports
        systemports = client.get_ports(name_pattern='system', is_audio=True, is_input=True, is_physical=True)
        dbgPrint(str(systemports))
        self.connected()
        return

    @dbus.service.method(dbus_interface='org.freedesktop.jackvolume')
    def registerAudioPorts(self):
        """registers audio ports"""
        global inports
        global outports
        if inports != [] and outports != []:
          return
        try:
            client.deactivate()
            i = 0
            inports = []
            outports = []
            for x in systemports:
                dbgPrint("creating audio ports " + str(i))
                inports.append(client.inports.register("input_"+str(i+1)))
                outports.append(client.outports.register("output_"+str(i+1)))
                i += 1
            client.activate()
        except:
            dbgPrint ("could not create audio ports")
        return

    @dbus.service.method(dbus_interface='org.freedesktop.jackvolume')
    def unregisterAudioPorts(self):
        """unregisters audio ports"""
        global inports
        global outports
        if outports == []:
          return
        client.deactivate()
        client.inports.clear()
        client.outports.clear()
        inports = []
        outports = []
        client.activate()
        dbgPrint("unregistered audio ports")
        return

    @dbus.service.method(dbus_interface='org.freedesktop.jackvolume')
    def connectAudioPorts(self):
        """connects audio ports"""
        i = 0
        for x in outports:
            if outports[i].connections == []:
                outports[i].connect(str(systemports[i]).split("'")[1]);
            i += 1
        dbgPrint("connected audio ports to system")
        return

    @dbus.service.method(dbus_interface='org.freedesktop.jackvolume')
    def disconnectAudioPorts(self):
        """disconnects audio ports"""
        i = 0
        for x in outports:
            if outports[i].connections != []:
                outports[i].disconnect();
            i += 1
        dbgPrint("disconnected audio ports")
        return

    @dbus.service.method(dbus_interface='org.freedesktop.jackvolume')
    def registerMidiPort(self):
        global midiport
        if midiport != []:
          return
        try:
            client.deactivate()
            midiport.append(client.midi_outports.register("output"))
            client.activate()
        except:
            dbgPrint("could not create midi port")
        return

    @dbus.service.method(dbus_interface='org.freedesktop.jackvolume')
    def unregisterMidiPort(self):
        global midiport
        if midiport == []:
          return
        try:
            client.deactivate()
            client.midi_outports.clear()
            client.activate()
        except:
            dbgPrint("could not unregister midi port")
        midiport = []
        return

    @dbus.service.method(dbus_interface='org.freedesktop.jackvolume')
    def connectMidiPort(self):
        """connects midi port"""
        if midiport == []:
          return
        if midiport[0].connections != []:
            midiport[0].disconnect()
        midiport[0].connect(portname)
        dbgPrint("connected midi port to " + portname)
        return

    @dbus.service.method(dbus_interface='org.freedesktop.jackvolume')
    def disconnectMidiPort(self):
        """disconnects midi port"""
        if midiport != [] and midiport[0].connections != []:
            midiport[0].disconnect()
            dbgPrint("disconnected midi port")
        return

    @dbus.service.method(dbus_interface='org.freedesktop.jackvolume')
    def setVolume(self, v):
        """sets volume"""
        global volume
        global audiovolume
        dbgPrint("set volume to " + str(v))
        volume = int(v)
        audiovolume = (volume/127) ** 5
        return

    @dbus.service.method(dbus_interface='org.freedesktop.jackvolume')
    def getVolume(self):
        """returns whatever is passed to it"""
        return volume

    @dbus.service.method(dbus_interface='org.freedesktop.jackvolume')
    def listMidiPorts(self):
        """gets list of (input) midi ports"""
        return str(client.get_ports(is_midi=True, is_input=True))

    @dbus.service.method(dbus_interface='org.freedesktop.jackvolume')
    def setPortName(self, p):
        """sets port (to connect to) name"""
        global portname
        dbgPrint("set portname to " + p)
        portname = p
        return

    @dbus.service.method(dbus_interface='org.freedesktop.jackvolume')
    def getPortName(self):
        """gets port (to connect to) name"""
        dbgPrint("portname is " + portname)
        return portname

    @dbus.service.method(dbus_interface='org.freedesktop.jackvolume')
    def Quit(self):
        """removes this object from the DBUS connection and exits"""
        global kill
        kill = 1
        self.remove_from_connection()
        Gtk.main_quit()
        if client != '':
            client.deactivate()
            client.close()
        return

DBusGMainLoop(set_as_default=True)
myservice = jvDbusService()
Gtk.main()


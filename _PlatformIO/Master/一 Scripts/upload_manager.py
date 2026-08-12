# This script is run by PlatformIO during the upload process.
# It sends UDP messages to a plotter application to release and re-acquire the COM port
try:
    from SCons.Script import Import  # type: ignore
except Exception:
    def Import(*_args, **_kwargs):  # type: ignore
        pass
    

try:
    from SCons.Script import Import  # type: ignore
    Import("env")
except Exception as e:
    print(f"PlatformIO: Could not import env ({e})")
    env = None
    
import socket
import os
import time

# 1) Apply C++-only flag EARLY (script is 'pre:' so this hits all C++ TUs)
env.Append(CXXFLAGS=["-Wno-sign-compare", "-Wno-volatile", "-Wno-deprecated-copy"])      # type: ignore
env.Append(CFLAGS=  ["-Wno-sign-compare"])                                               # type: ignore


UDP_IP = "127.0.0.1"
UDP_PORT = 11000

def send_udp_message(message):
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.sendto(bytes(message, "ascii"), (UDP_IP, UDP_PORT))
    except Exception as e:
        print(f"PlatformIO: Could not send UDP message.  Error: {e}")

def before_upload(source, target, env):
    print("PlatformIO: Notifying plotter to release COM port...")
    send_udp_message("DISCONNECT")
    time.sleep(0.5)

def after_upload(source, target, env):
    print("PlatformIO: Notifying plotter to reconnect...")
    send_udp_message("RECONNECT")


env.AddPreAction ("upload", before_upload)  # type: ignore
env.AddPostAction("upload", after_upload)   # type: ignore

try:
    project_dir = env['PROJECT_DIR']
    project_name = os.path.basename(project_dir)
    print(f"PlatformIO: Injecting PROJECT_NAME = \"{project_name}\"")
    env.Append(CPPDEFINES=[("PROJECT_NAME", f'\\"{project_name}\\"')])
except Exception as e:
    print(f"PlatformIO: Could not inject project name: {e}")
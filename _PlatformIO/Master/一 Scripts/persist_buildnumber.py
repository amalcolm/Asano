# build_number.py (or add to your existing upload_manager.py)

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
    
import os

proj = os.path.basename(env["PROJECT_DIR"])
pioenv = env.get("PIOENV", "default")

build_file = os.path.join(env["PROJECT_DIR"], "一 Scripts", ".buildnum")

def read_int(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return int(f.read().strip())
    except Exception:
        return 0

last = read_int(build_file)
this_build = last + 1

def compile_build_string(env, node):
    build_string = ("BUILD_STR", env.StringifyMacro(str(this_build)))
    return env.Object(node, CPPDEFINES=[*env["CPPDEFINES"], build_string])

env.AddBuildMiddleware(compile_build_string, "*_Helpers/BuildString.cpp")

# Only commit the increment if the build actually produces an ELF
def persist_build_number(target, source, env):
    with open(build_file, "w", encoding="utf-8") as f:
        f.write(f"{this_build}\n")

env.AddPostAction("$BUILD_DIR/${PROGNAME}.elf", persist_build_number)

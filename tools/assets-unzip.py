"""UTF-8 safe ZIP extraction; Windows tar can omit Cyrillic filenames."""
import pathlib
import stat
import sys
import zipfile

archive, output = sys.argv[1:]
root = pathlib.Path(output).resolve()
with zipfile.ZipFile(archive) as z:
    for entry in z.infolist():
        name = entry.filename.replace('\\', '/')
        target = (root / name).resolve()
        if not target.is_relative_to(root) or ':' in name or stat.S_ISLNK(entry.external_attr >> 16):
            raise ValueError(f'Unsafe ZIP entry: {name}')
    z.extractall(root)

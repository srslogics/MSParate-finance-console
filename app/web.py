"""Public application shell; business endpoints keep their existing authentication."""
from pathlib import Path
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

FRONTEND = Path(__file__).resolve().parents[1] / 'frontend'
PUBLIC_FILES = {'/': 'index.html', '/index.html': 'index.html',
                '/sw.js': 'sw.js', '/manifest.webmanifest': 'manifest.webmanifest'}
PUBLIC_DIRECTORIES = ('/css/', '/js/', '/assets/')


def is_frontend_path(path):
    return path in PUBLIC_FILES or path.startswith(PUBLIC_DIRECTORIES)


def mount_frontend(app):
    for directory in ('css', 'js', 'assets'):
        app.mount('/' + directory, StaticFiles(directory=FRONTEND / directory), name=directory)
    for route, filename in PUBLIC_FILES.items():
        # Do not expose filename as a query parameter.
        def endpoint_factory(name):
            def endpoint():
                return FileResponse(FRONTEND / name, headers={'Cache-Control': 'no-cache'})
            return endpoint
        app.add_api_route(route, endpoint_factory(filename), methods=['GET', 'HEAD'], include_in_schema=False)

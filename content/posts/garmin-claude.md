---
title: Cómo conectar tu Garmin con Claude
slug: garmin-claude
date: 2026-10-06
tags: running, garmin, ia
excerpt: Baja tus actividades, sueño y HRV de Garmin Connect a un archivo y deja que Claude te ayude a leerlos — y hasta a subir workouts a tu reloj.
---

Esta es la forma en la que yo conecto mi Garmin con Claude para entender mejor mis entrenamientos. No es una app oficial: es un mini proyecto en Visual Studio Code con Python que baja tus datos de Garmin Connect a un archivo, y luego Claude los analiza contigo.

> **Importante:** esto usa [`python-garminconnect`](https://github.com/cyberjunky/python-garminconnect), una librería **no oficial** de la comunidad. Garmin puede cambiar cosas y dejar de funcionar en cualquier momento. Úsala con tu propia cuenta y bajo tu propio riesgo.

## Lo que necesitas

- Una cuenta de Garmin Connect con tu reloj sincronizado
- Python 3 instalado
- Visual Studio Code (o la terminal que prefieras)
- Claude (la app, o Claude Code dentro de VS Code)

## 1. Crea tu carpeta e instala la librería

Crea una carpeta para el proyecto (yo le puse `garmin-ai`) y ábrela en VS Code. En la terminal:

```bash
pip install garminconnect
```

## 2. Inicia sesión una sola vez

El script pide tu contraseña **en la terminal** (nunca la escribas dentro del código) y guarda un token en `~/.garminconnect`. Después de eso ya no necesitas volver a meter la contraseña hasta que el token caduque.

```python
from garminconnect import Garmin
from pathlib import Path
import getpass

TOKEN_DIR = str(Path.home() / ".garminconnect")

email = input("Email de Garmin: ")
pw = getpass.getpass("Contraseña: ")
client = Garmin(email=email, password=pw)
client.login(TOKEN_DIR)  # guarda el token aquí
```

Si te sale un error 429 (*too many requests*), espera unos minutos antes de intentar otra vez.

## 3. Baja tus datos a un archivo

Con el token guardado, un segundo script baja tus últimos días: actividades (distancia, duración, ritmo, FC promedio/máxima, VO2 max) y wellness (pasos, FC en reposo, sueño, estrés y HRV). Todo se guarda en `garmin/data.json`.

```python
from garminconnect import Garmin
from datetime import date, timedelta
from pathlib import Path
import json

client = Garmin()
client.login(str(Path.home() / ".garminconnect"))

today = date.today()
start = today - timedelta(days=7)
data = {"activities": client.get_activities_by_date(start.isoformat(), today.isoformat()),
        "wellness": {}}

for i in range(8):
    d = (start + timedelta(days=i)).isoformat()
    data["wellness"][d] = {
        "stats": client.get_stats(d),
        "sleep": client.get_sleep_data(d),
        "hrv": client.get_hrv_data(d),
    }

Path("garmin").mkdir(exist_ok=True)
Path("garmin/data.json").write_text(json.dumps(data, indent=2, default=str))
```

## 4. Pídele a Claude que lo lea

Si usas **Claude Code en VS Code**, abre la carpeta y pídele algo como:

- *"Lee garmin/data.json y dime cómo vienen mis ritmos esta semana vs. la anterior."*
- *"¿Mi sueño y HRV de los últimos días dicen que debería bajarle a la intensidad mañana?"*
- *"Hazme una tabla de mis runs con distancia, ritmo y FC promedio."*

Si usas la **app de Claude**, puedes subir el `data.json` directamente al chat y hacer las mismas preguntas.

## 5. Bonus: sube workouts a tu reloj

La misma librería permite crear entrenamientos estructurados (calentamiento, intervalos, enfriamiento) en Garmin Connect, que luego se sincronizan a tu reloj. Yo le pido a Claude que convierta mi plan de entrenamiento en un script que los suba semana por semana — así no los armo a mano en la app.

## Tips de seguridad

- Nunca pegues tu contraseña dentro del código ni la subas a GitHub.
- Agrega `.garminconnect/` y tus archivos `.json` a tu `.gitignore`: tienen datos personales.
- Si compartes tu proyecto, comparte el código, no tus datos.

¿Lo intentas? Cuéntame en TikTok o Instagram cómo te fue ✨

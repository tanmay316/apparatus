from PIL import Image
import os
import glob

def process_and_center(filepath):
    try:
        img = Image.open(filepath).convert('RGBA')
        width, height = img.size
        
        bg_color = img.getpixel((0, 0))
        is_transparent = bg_color[3] < 10
        
        rows_with_pixels = []
        for y in range(height):
            has_pixel = False
            for x in range(width):
                p = img.getpixel((x, y))
                if is_transparent:
                    if p[3] > 10: has_pixel = True
                else:
                    if abs(p[0] - bg_color[0]) > 20 or abs(p[1] - bg_color[1]) > 20 or abs(p[2] - bg_color[2]) > 20:
                        has_pixel = True
                if has_pixel: break
            if has_pixel:
                rows_with_pixels.append(y)
                
        if not rows_with_pixels:
            return
            
        gaps = []
        current_gap = -1
        for y in range(rows_with_pixels[0], rows_with_pixels[-1] + 1):
            if y not in rows_with_pixels:
                if current_gap == -1: current_gap = y
            else:
                if current_gap != -1:
                    gaps.append((current_gap, y - 1))
                    current_gap = -1
                    
        logo_bottom = rows_with_pixels[-1]
        if gaps:
            last_gap_start, last_gap_end = gaps[-1]
            if last_gap_start > height / 2:
                logo_bottom = last_gap_start - 1

        x_min, x_max = width, 0
        y_min, y_max = height, 0
        
        for y in range(rows_with_pixels[0], logo_bottom + 1):
            for x in range(width):
                p = img.getpixel((x, y))
                is_logo = False
                if is_transparent:
                    if p[3] > 10: is_logo = True
                else:
                    if abs(p[0] - bg_color[0]) > 20 or abs(p[1] - bg_color[1]) > 20 or abs(p[2] - bg_color[2]) > 20:
                        is_logo = True
                
                if is_logo:
                    x_min = min(x_min, x)
                    x_max = max(x_max, x)
                    y_min = min(y_min, y)
                    y_max = max(y_max, y)
                    
        if x_max < x_min or y_max < y_min: return
        
        logo_w = x_max - x_min + 1
        logo_h = y_max - y_min + 1
        
        logo = img.crop((x_min, y_min, x_max + 1, y_max + 1))
        
        new_w = int(logo_w * 0.85)
        new_h = int(logo_h * 0.85)
        logo = logo.resize((new_w, new_h), Image.Resampling.LANCZOS)
        logo_w, logo_h = new_w, new_h
        
        new_img = Image.new('RGBA', (width, height), bg_color if not is_transparent else (0, 0, 0, 0))
        
        paste_x = (width - logo_w) // 2
        paste_y = (height - logo_h) // 2
        
        new_img.paste(logo, (paste_x, paste_y))
        new_img.save(filepath)
        print(f"Centered and cleaned {filepath}")
    except Exception as e:
        print(f"Error processing {filepath}: {e}")

images = [
    'assets/icon.png',
    'assets/logo.png',
    'assets/splash.png',
    'public/logo.png',
    'public/app-icon-192.png',
    'public/app-icon-512.png',
]

for p in images:
    if os.path.exists(p):
        process_and_center(p)

# Also process all android foreground icons directly, so we don't even need to use @capacitor/assets!
android_icons = glob.glob('android/app/src/main/res/mipmap-*/ic_launcher_foreground.png') + \
                glob.glob('android/app/src/main/res/mipmap-*/ic_launcher.png') + \
                glob.glob('android/app/src/main/res/mipmap-*/ic_launcher_round.png')

import shutil

for p in android_icons:
    process_and_center(p)
    if 'ic_launcher_foreground.png' in p:
        try:
            shutil.copy(p, p.replace('ic_launcher_foreground.png', 'ic_notification.png'))
            print(f"Created {p.replace('ic_launcher_foreground.png', 'ic_notification.png')}")
        except Exception as e:
            pass

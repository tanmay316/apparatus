from PIL import Image

def fix_image_with_bg(filepath):
    try:
        img = Image.open(filepath).convert('RGBA')
        width, height = img.size
        bg_color = img.getpixel((0, 0)) # Sample top-left for background
        
        rows_with_pixels = []
        for y in range(height):
            has_pixel = False
            for x in range(width):
                p = img.getpixel((x, y))
                # Check if it differs from background
                if abs(p[0] - bg_color[0]) > 20 or abs(p[1] - bg_color[1]) > 20 or abs(p[2] - bg_color[2]) > 20:
                    has_pixel = True
                    break
            if has_pixel:
                rows_with_pixels.append(y)
                
        if not rows_with_pixels:
            return
            
        gaps = []
        current_gap_start = -1
        for y in range(rows_with_pixels[0], rows_with_pixels[-1] + 1):
            if y not in rows_with_pixels:
                if current_gap_start == -1:
                    current_gap_start = y
            else:
                if current_gap_start != -1:
                    gaps.append((current_gap_start, y - 1))
                    current_gap_start = -1
                    
        print(f"{filepath} ({width}x{height}) Gaps: {gaps}")
        
        if gaps:
            last_gap_start, last_gap_end = gaps[-1]
            if last_gap_start > height / 2:
                for y in range(last_gap_end + 1, height):
                    for x in range(width):
                        img.putpixel((x, y), bg_color)
                img.save(filepath)
                print(f"Fixed {filepath}")
    except Exception as e:
        print(f"Error processing {filepath}: {e}")

images = [
    'public/app-icon-192.png',
    'public/app-icon-512.png'
]

for img_path in images:
    fix_image_with_bg(img_path)

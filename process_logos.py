from PIL import Image

def fix_image(filepath):
    try:
        img = Image.open(filepath).convert('RGBA')
        width, height = img.size
        
        rows_with_pixels = []
        for y in range(height):
            has_pixel = False
            for x in range(width):
                if img.getpixel((x, y))[3] > 10:
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
            # Assume the last gap separates the logo from the text
            last_gap_start, last_gap_end = gaps[-1]
            
            # Only do this if the gap is in the bottom half
            if last_gap_start > height / 2:
                # Erase everything below the gap
                for y in range(last_gap_end + 1, height):
                    for x in range(width):
                        img.putpixel((x, y), (0, 0, 0, 0))
                img.save(filepath)
                print(f"Fixed {filepath}")
    except Exception as e:
        print(f"Error processing {filepath}: {e}")

images = [
    'assets/icon.png',
    'assets/logo.png',
    'assets/splash.png',
    'public/logo.png',
    'public/app-icon-192.png',
    'public/app-icon-512.png'
]

for img_path in images:
    fix_image(img_path)

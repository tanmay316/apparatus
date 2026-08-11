from PIL import Image

def analyze():
    img = Image.open('assets/icon.png').convert('RGBA')
    width, height = img.size
    
    rows_with_pixels = []
    for y in range(height):
        has_pixel = False
        for x in range(width):
            if img.getpixel((x, y))[3] > 10:  # Alpha > 10
                has_pixel = True
                break
        if has_pixel:
            rows_with_pixels.append(y)
            
    if not rows_with_pixels:
        print("No pixels found!")
        return
        
    print(f"Pixels found from row {rows_with_pixels[0]} to {rows_with_pixels[-1]}")
    
    # Find gaps (empty rows) between the top and bottom
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
                
    print(f"Gaps found: {gaps}")

if __name__ == '__main__':
    analyze()

from PIL import Image

def analyze_512():
    img = Image.open('public/app-icon-512.png').convert('RGBA')
    width, height = img.size
    print(f"512x512 middle pixel: {img.getpixel((width//2, height//2))}")
    print(f"512x512 top-left pixel: {img.getpixel((0, 0))}")

if __name__ == '__main__':
    analyze_512()

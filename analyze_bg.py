from PIL import Image

def analyze():
    img = Image.open('android/app/src/main/res/mipmap-xxhdpi/ic_launcher_background.png').convert('RGBA')
    width, height = img.size
    print(f"ic_launcher_background middle pixel: {img.getpixel((width//2, height//2))}")

if __name__ == '__main__':
    analyze()

# Webcam Monitoring Cascade Files

## Required Files for Face and Eye Detection

Download these files from OpenCV repository and place them in this folder:

1. **haarcascade_frontalface_default.xml** - For face detection
2. **haarcascade_eye.xml** - For eye detection

## Download Links:
- https://github.com/opencv/opencv/blob/master/data/haarcascades/haarcascade_frontalface_default.xml
- https://github.com/opencv/opencv/blob/master/data/haarcascades/haarcascade_eye.xml

## Usage:
The webcam monitoring system will automatically load these files for real-time face and eye detection during online tests.

## Fallback:
If files are not available, the system will still work with basic monitoring features. 
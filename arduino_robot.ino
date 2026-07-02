#include <Servo.h>

Servo leftFlipper;
Servo rightFlipper;
// Servo baseRotation; // For future 360 degree base rotation

void setup() {
  // Initialize serial communication at 115200 baud
  Serial.begin(115200);
  
  // Attach flippers to pins 9 and 10
  leftFlipper.attach(9);
  rightFlipper.attach(10);
  
  // Set flippers to default resting position (90 degrees = horizontal)
  leftFlipper.write(90);
  rightFlipper.write(90);
}

void loop() {
  // Check if data is available to read
  if (Serial.available() > 0) {
    // Read the incoming string until newline
    String command = Serial.readStringUntil('\n');
    command.trim(); // Remove whitespace
    
    // Command format: "L:90" (Left flipper 90 deg), "R:45" (Right flipper 45 deg)
    if (command.startsWith("L:")) {
      int pos = command.substring(2).toInt();
      // Constrain position between 0 and 180
      pos = constrain(pos, 0, 180);
      leftFlipper.write(pos);
    } 
    else if (command.startsWith("R:")) {
      int pos = command.substring(2).toInt();
      pos = constrain(pos, 0, 180);
      rightFlipper.write(pos);
    }
    else if (command.startsWith("B:")) {
      // Future: Base rotation command processing
      // int pos = command.substring(2).toInt();
      // baseRotation.write(pos);
    }
  }
}

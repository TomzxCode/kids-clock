# 🕐 Kids Clock - Fun Time Learning App

A colorful, interactive Progressive Web App (PWA) designed for children to learn time while managing daily activities through scheduled events.

## ✨ Features

### 📱 Clock Display
- **Digital Clock**: Large, easy-to-read numbers with current date
- **Analog Clock**: Traditional clock face with hour, minute, and second hands
- Toggle between digital and analog views with a simple button

### 🎯 Event Scheduling
Create three types of events that trigger at specific times:

1. **📢 Announcements**
   - Display text messages at scheduled times
   - Perfect for reminders like "Time to brush teeth!" or "Snack time!"

2. **🖼️ Picture Events**
   - Show images at specific times
   - Upload images or use URLs
   - Great for visual schedules and routines

3. **🎵 Audio Events**
   - Play audio files at scheduled times
   - Upload audio or use URLs
   - Ideal for songs, alarms, or voice reminders

### ⚙️ Event Configuration
- Set specific times for events (HH:MM format)
- Name your events for easy identification
- Option to repeat events daily
- Delete events when no longer needed
- Events persist in browser storage

### 🌈 Child-Friendly Design
- Bright, colorful gradients
- Large, readable fonts (Comic Sans MS)
- Fun emoji icons throughout
- Smooth animations and transitions
- Responsive design for all devices

### 📲 PWA Features
- Install on mobile devices and desktops
- Works offline after first load
- Cached resources for fast loading
- Standalone app experience

## 🚀 Getting Started

### Installation

1. **Open in a Web Browser**
   - Simply open `index.html` in any modern web browser
   - Chrome, Firefox, Safari, Edge all supported

2. **Install as PWA** (Optional)
   - On mobile: Tap the browser menu and select "Add to Home Screen"
   - On desktop Chrome: Click the install icon in the address bar
   - On desktop Edge: Click the install icon or go to Settings > Apps > Install

### Using a Local Server

For the best experience, serve the files using a local web server:

```bash
# Using Python 3
python -m http.server 8000

# Using Node.js (http-server)
npx http-server -p 8000

# Using PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

## 📖 How to Use

### Viewing the Clock

1. The clock starts automatically when you load the app
2. Use the **Digital** and **Analog** buttons to switch views
3. The digital clock shows hours, minutes, seconds, and the current date
4. The analog clock has moving hands that update in real-time

### Creating Events

1. Click the **"➕ Add New Event"** button
2. Choose the event type:
   - **Announcement**: For text messages
   - **Picture**: For displaying images
   - **Audio**: For playing sounds
3. Set the time when you want the event to trigger
4. Give your event a name
5. Add the specific content:
   - For announcements: Write your message
   - For pictures: Upload an image or paste a URL
   - For audio: Upload an audio file or paste a URL
6. Check **"Repeat daily"** if you want this event every day
7. Click **"Save Event"**

### Managing Events

- All your events appear in the **"Upcoming Events"** section
- Events are sorted by time
- Click the 🗑️ button to delete an event
- One-time events automatically disable after triggering
- Daily events repeat every day at the scheduled time

### When Events Trigger

- A notification sound plays when an event triggers
- A full-screen overlay shows the event content
- Click the ✖️ button to close the overlay
- Audio events start playing automatically

## 💾 Data Storage

- All events are saved in your browser's local storage
- Events persist even after closing the browser
- Clearing browser data will remove all events
- Each device/browser has its own event list

## 🎨 Customization

The app uses CSS variables and is easy to customize:

- Colors: Edit the gradient values in `styles.css`
- Fonts: Change the font-family in the body selector
- Animations: Modify keyframe animations for different effects
- Layout: Adjust padding, margins, and sizes as needed

## 🌐 Browser Support

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (iOS 11.3+)
- Opera: Full support

### Required Features
- JavaScript enabled
- LocalStorage support
- CSS3 animations
- Web Audio API (for notification sounds)

## 📱 Mobile Features

- Touch-friendly buttons and controls
- Responsive layout for all screen sizes
- Works in landscape and portrait modes
- Can be added to home screen as an app
- Works offline after installation

## 🔧 Troubleshooting

**Events not triggering:**
- Make sure the browser tab is open and active
- Check that the time is set correctly
- Verify the event is enabled (not disabled after one-time use)

**Images/Audio not loading:**
- Check that the URL is accessible
- For uploaded files, they're stored as base64 data
- Large files may take time to load

**PWA not installing:**
- Ensure you're using HTTPS (or localhost)
- Check that manifest.json is loading correctly
- Try a different browser

**Clock not updating:**
- Refresh the page
- Check browser console for errors
- Ensure JavaScript is enabled

## 🎓 Educational Benefits

- **Time Reading**: Children learn to read both digital and analog clocks
- **Time Management**: Understanding schedules and routines
- **Independence**: Self-directed activities based on scheduled events
- **Visual Learning**: Picture-based schedules for better understanding
- **Routine Building**: Daily repeating events establish habits

## 🛠️ Technical Details

- **Pure JavaScript**: No frameworks required
- **Vanilla CSS**: Modern CSS3 features
- **Service Worker**: Offline capability
- **LocalStorage API**: Data persistence
- **Web Audio API**: Notification sounds
- **FileReader API**: Image/audio uploads
- **SVG**: Analog clock rendering

## 📄 Files

- `index.html` - Main HTML structure
- `styles.css` - All styling and animations
- `app.js` - Application logic
- `manifest.json` - PWA configuration
- `service-worker.js` - Offline functionality
- `README.md` - This documentation

## 🤝 Contributing

Feel free to enhance the app with:
- More event types
- Additional clock styles
- Theme customization
- Sound effects
- Animations
- Accessibility improvements

## 📝 License

Free to use, modify, and distribute for educational and personal purposes.

## 🎉 Have Fun!

This app is designed to make learning time fun for children. Customize it, experiment with different events, and create a daily routine that works for your family!

---

Made with ❤️ for kids learning to tell time

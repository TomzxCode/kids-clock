// Kids Clock App - Main Application Logic

// SunCalc - MIT license
// https://github.com/mourner/suncalc
// Simplified version with only sunrise/sunset functions
var SunCalc = {};

// shortcuts for easier to read formulas
var PI = Math.PI,
    rad = PI / 180,
    dayMs = 1000 * 60 * 60 * 24,
    J1970 = 2440588,
    J2000 = 2451545;

function toJulian(date) { return date.valueOf() / dayMs - 0.5 + J1970; }
function fromJulian(j)  { return new Date((j + 0.5 - J1970) * dayMs); }
function toDays(date)   { return toJulian(date) - J2000; }

// general calculations for position

var e = rad * 23.4397; // obliquity of the Earth

function rightAscension(l, b) { return Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l)); }
function declination(l, b)    { return Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l)); }
function azimuth(H, phi, dec)  { return Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)); }
function altitude(H, phi, dec) { return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)); }
function siderealTime(d, lw)   { return rad * (280.16 + 360.9856235 * d) - lw; }

function astroRefraction(h) {
    if (h < 0) h = 0; // the following formula works for positive altitudes only.
    return 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179));
}

// general sun calculations

function solarMeanAnomaly(d) { return rad * (357.5291 + 0.98560028 * d); }

function eclipticLongitude(M) {
    var C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)),
        P = rad * 102.9372; // perihelion of the Earth
    return M + C + P + PI;
}

function sunCoords(d) {
    var M = solarMeanAnomaly(d);
    var L = eclipticLongitude(M);
    return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}

// calculates sun position for a given date and latitude/longitude
SunCalc.getPosition = function(date, lat, lng) {
    var lw  = rad * -lng,
        phi = rad * lat,
        d   = toDays(date),
        c   = sunCoords(d),
        H   = siderealTime(d, lw) - c.ra;

    return {
        azimuth: azimuth(H, phi, c.dec),
        altitude: altitude(H, phi, c.dec)
    };
};

// sun times configuration (angle, morning name, evening name)
var times = SunCalc.times = [
    [-0.833, 'sunrise', 'sunset']
];

// add hours of taken times
var J0 = 0.0009;

function julianCycle(d, lw) { return Math.round(d - J0 - lw / (2 * PI)); }

function approxTransit(Ht, lw, n) { return J0 + (Ht + lw) / (2 * PI) + n; }
function solarTransitJ(ds, M, L)  { return J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L); }

function hourAngle(h, phi, d) { return Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d))); }

// returns set time for the given sun altitude
function getSetJ(h, lw, phi, dec, n, M, L) {
    var w = hourAngle(h, phi, dec),
        a = approxTransit(w, lw, n);
    return solarTransitJ(a, M, L);
}

// calculates sun times for a given date and latitude/longitude
SunCalc.getTimes = function(date, lat, lng) {
    var lw = rad * -lng,
        phi = rad * lat,
        d = toDays(date),
        n = julianCycle(d, lw),
        ds = approxTransit(0, lw, n),
        M = solarMeanAnomaly(ds),
        L = eclipticLongitude(M),
        dec = declination(L, 0),
        Jnoon = solarTransitJ(ds, M, L),

        i, len, time, h0, Jset, Jrise;

    var result = {};

    for (i = 0, len = times.length; i < len; i += 1) {
        time = times[i];
        h0 = time[0] * rad;

        Jset = getSetJ(h0, lw, phi, dec, n, M, L);
        Jrise = Jnoon - (Jset - Jnoon);

        result[time[1]] = fromJulian(Jrise);
        result[time[2]] = fromJulian(Jset);
    }

    return result;
};

class KidsClockApp {
    constructor() {
        this.events = [];
        this.currentEventId = null;
        this.editingEventId = null;
        this.checkInterval = null;
        this.backgroundInterval = null;
        this.wakeLock = null;

        // Debug mode state
        this.debugMode = {
            enabled: false,
            speed: 1,
            simulatedTime: null,
            lastRealTime: Date.now(),
            lastSimulatedTime: Date.now()
        };

        this.settings = {
            enableTTS: true,
            ttsVoice: '',
            ttsRate: 1,
            ttsPitch: 1,
            enable24Hour: false,
            showDigitalClock: true,
            showAnalogClock: false,
            enableHourlyAnnouncement: false,
            hourlyAnnouncementStart: '08:00',
            hourlyAnnouncementEnd: '22:00',
            hourlyAnnouncementFormat: '',
            hourlyAnnouncement24Hour: false,
            showSeconds: true,
            showAnalogSeconds: true,
            debugMode: false,
            debugSpeed: 1,
            backgroundMode: 'gradient',
            // Location for sunrise/sunset calculations (default: null = will try to detect)
            latitude: null,
            longitude: null,
            keepScreenAwake: false
        };
        this.timeColors = [
            { time: '06:00', color1: '#FFB347', color2: '#FFCC33', name: 'Dawn' },
            { time: '09:00', color1: '#87CEEB', color2: '#4FC3F7', name: 'Morning' },
            { time: '12:00', color1: '#FFD700', color2: '#FFA500', name: 'Noon' },
            { time: '17:00', color1: '#FF6B6B', color2: '#EE5A6F', name: 'Evening' },
            { time: '19:00', color1: '#667eea', color2: '#764ba2', name: 'Dusk' },
            { time: '21:00', color1: '#000000', color2: '#1a1a2e', name: 'Night' },
            { time: '05:00', color1: '#000000', color2: '#1a1a2e', name: 'Night' }
        ];
        // Event recurrence state tracking
        this.eventLastTriggered = {}; // Map: eventId -> last triggered timestamp
        this.init();
    }

    // Time abstraction layer - returns current time (real or simulated)
    getCurrentTime() {
        if (!this.debugMode.enabled) {
            return new Date();
        }

        const now = Date.now();
        const realElapsed = now - this.debugMode.lastRealTime;
        const simElapsed = realElapsed * this.debugMode.speed;
        this.debugMode.simulatedTime = this.debugMode.lastSimulatedTime + simElapsed;
        this.debugMode.lastRealTime = now;
        this.debugMode.lastSimulatedTime = this.debugMode.simulatedTime;

        return new Date(this.debugMode.simulatedTime);
    }

    // For getting timestamp (like Date.now())
    getCurrentTimestamp() {
        if (!this.debugMode.enabled) {
            return Date.now();
        }
        return Math.floor(this.debugMode.simulatedTime);
    }

    // Set debug mode state
    setDebugMode(enabled, speed = 1) {
        this.debugMode.enabled = enabled;
        this.debugMode.speed = speed;

        if (enabled) {
            // Initialize simulated time from current real time if not already set
            if (!this.debugMode.simulatedTime) {
                this.debugMode.simulatedTime = Date.now();
                this.debugMode.lastSimulatedTime = this.debugMode.simulatedTime;
            }
            this.debugMode.lastRealTime = Date.now();

            // Restart intervals with adjusted speed
            this.restartIntervals();
        } else {
            // Disable debug mode and reset
            this.debugMode.simulatedTime = null;
            this.restartIntervals();
        }

        // Update UI to show debug status
        this.updateDebugIndicator();
    }

    // Restart intervals based on debug mode
    restartIntervals() {
        // Clear existing intervals
        clearInterval(this.clockInterval);
        clearInterval(this.checkInterval);
        clearInterval(this.backgroundInterval);

        // Calculate interval based on speed
        const clockInterval = this.debugMode.enabled ? Math.max(100, Math.floor(1000 / this.debugMode.speed)) : 1000;
        const checkInterval = this.debugMode.enabled ? Math.max(100, Math.floor(1000 / this.debugMode.speed)) : 1000;
        const bgInterval = this.debugMode.enabled ? Math.max(100, Math.floor(60000 / this.debugMode.speed)) : 60000;

        // Restart intervals
        this.startClock();
        this.startEventChecker();
        this.startBackgroundUpdater();
    }

    // Update debug indicator on screen
    updateDebugIndicator() {
        let indicator = document.getElementById('debugIndicator');
        if (this.debugMode.enabled) {
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.id = 'debugIndicator';
                indicator.style.cssText = `
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    background: rgba(255, 0, 0, 0.8);
                    color: white;
                    padding: 10px 15px;
                    border-radius: 8px;
                    font-weight: bold;
                    z-index: 1000;
                    font-size: 14px;
                `;
                document.body.appendChild(indicator);
            }
            indicator.textContent = `DEBUG MODE (${this.debugMode.speed}x speed)`;
            indicator.style.display = 'block';
        } else {
            if (indicator) {
                indicator.style.display = 'none';
            }
        }
    }

    // Screen Wake Lock API methods
    async requestWakeLock() {
        if (!('wakeLock' in navigator)) {
            console.log('Screen Wake Lock API not supported');
            return false;
        }

        try {
            this.wakeLock = await navigator.wakeLock.request('screen');
            console.log('Screen Wake Lock active');
            return true;
        } catch (err) {
            console.log(`Screen Wake Lock error: ${err.name}, ${err.message}`);
            return false;
        }
    }

    async releaseWakeLock() {
        if (this.wakeLock !== null) {
            try {
                await this.wakeLock.release();
                this.wakeLock = null;
                console.log('Screen Wake Lock released');
            } catch (err) {
                console.log(`Screen Wake Lock release error: ${err.name}, ${err.message}`);
            }
        }
    }

    handleWakeLockRelease() {
        if (this.wakeLock) {
            this.wakeLock.addEventListener('release', () => {
                console.log('Screen Wake Lock was released');
                this.wakeLock = null;
            });
        }
    }

    async updateWakeLock() {
        if (this.settings.keepScreenAwake) {
            await this.requestWakeLock();
            this.handleWakeLockRelease();
        } else {
            await this.releaseWakeLock();
        }
    }

    init() {
        this.loadEvents();
        this.loadSettings();
        this.loadTimeColors();
        this.generateStars();
        this.randomizeCarColors();
        this.setupEventListeners();
        // Restore debug mode state from settings
        if (this.settings.debugMode) {
            this.setDebugMode(true, this.settings.debugSpeed);
        }
        this.startClock();
        this.startEventChecker();
        this.startBackgroundUpdater();
        this.renderEvents();
        this.loadVoices();
        this.applySavedClockType();
        this.applyBackgroundMode();
        // Initialize wake lock if enabled
        this.updateWakeLock();
        // Re-acquire wake lock when page becomes visible
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.settings.keepScreenAwake) {
                this.updateWakeLock();
            }
        });
    }

    // Clock Functions
    startClock() {
        this.updateClock();
        // Use dynamic interval based on debug mode
        const interval = this.debugMode.enabled ? Math.max(100, Math.floor(1000 / this.debugMode.speed)) : 1000;
        this.clockInterval = setInterval(() => this.updateClock(), interval);
    }

    updateClock() {
        const now = this.getCurrentTime();

        // Update digital clock
        let hours = now.getHours();
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        // Format hours based on 24-hour setting
        const ampmElement = document.getElementById('ampm');
        if (this.settings.enable24Hour) {
            hours = String(hours).padStart(2, '0');
            ampmElement.textContent = '';
        } else {
            const period = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12 || 12;
            hours = String(hours).padStart(2, '0');
            ampmElement.textContent = ' ' + period;
        }

        document.getElementById('hours').textContent = hours;
        document.getElementById('minutes').textContent = minutes;

        const secondsElement = document.getElementById('seconds');
        if (this.settings.showSeconds) {
            secondsElement.textContent = seconds;
            secondsElement.style.display = 'inline';
            // Show the colon before seconds
            const prevSibling = secondsElement.previousSibling;
            if (prevSibling && prevSibling.nodeType === Node.TEXT_NODE) {
                prevSibling.textContent = ':';
            }
        } else {
            secondsElement.style.display = 'none';
            // Hide the colon before seconds
            const prevSibling = secondsElement.previousSibling;
            if (prevSibling && prevSibling.nodeType === Node.TEXT_NODE) {
                prevSibling.textContent = '';
            }
        }

        // Update date
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('dateDisplay').textContent = now.toLocaleDateString('en-US', options);

        // Update analog clock
        this.updateAnalogClock(now);
    }

    updateAnalogClock(date) {
        const hours = date.getHours() % 12;
        const minutes = date.getMinutes();
        const seconds = date.getSeconds();

        // Calculate angles (hands start pointing at 12 o'clock)
        const hourAngle = (hours * 30) + (minutes * 0.5);
        const minuteAngle = (minutes * 6);
        const secondAngle = (seconds * 6);

        const hourHand = document.getElementById('hourHand');
        const minuteHand = document.getElementById('minuteHand');
        const secondHand = document.getElementById('secondHand');

        if (hourHand) {
            hourHand.setAttribute('transform', `rotate(${hourAngle} 100 100)`);
        }
        if (minuteHand) {
            minuteHand.setAttribute('transform', `rotate(${minuteAngle} 100 100)`);
        }
        if (secondHand) {
            if (this.settings.showAnalogSeconds) {
                secondHand.style.display = 'block';
                secondHand.setAttribute('transform', `rotate(${secondAngle} 100 100)`);
            } else {
                secondHand.style.display = 'none';
            }
        }
    }

    // Event Listeners
    setupEventListeners() {
        // Clock visibility checkboxes in settings
        document.getElementById('showDigitalClock').addEventListener('change', (e) => {
            this.updateClockVisibility();
            this.saveCurrentSettings();
        });

        document.getElementById('showAnalogClock').addEventListener('change', (e) => {
            this.updateClockVisibility();
            this.saveCurrentSettings();
        });

        // Add event button in settings
        document.getElementById('addEventBtnSettings').addEventListener('click', () => {
            this.openModal();
        });

        document.getElementById('closeModal').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('cancelEventBtn').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('saveEventBtn').addEventListener('click', () => {
            this.saveEvent();
        });

        // Overlay close
        document.getElementById('closeOverlay').addEventListener('click', () => {
            this.closeOverlay();
        });

        // Picture upload
        document.getElementById('pictureUpload').addEventListener('change', (e) => {
            this.handleFileUpload(e, 'picture');
        });

        // Audio upload
        document.getElementById('audioUpload').addEventListener('change', (e) => {
            this.handleFileUpload(e, 'audio');
        });

        // Settings controls
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.openSettings();
        });

        document.getElementById('closeSettings').addEventListener('click', () => {
            this.closeSettings();
        });

        // Immediate settings changes
        document.getElementById('enableTTS').addEventListener('change', () => {
            this.saveCurrentSettings();
        });

        document.getElementById('ttsVoice').addEventListener('change', () => {
            this.saveCurrentSettings();
        });

        document.getElementById('enable24Hour').addEventListener('change', () => {
            this.saveCurrentSettings();
        });

        document.getElementById('showSeconds').addEventListener('change', () => {
            this.saveCurrentSettings();
        });

        document.getElementById('showAnalogSeconds').addEventListener('change', () => {
            this.saveCurrentSettings();
        });

        document.getElementById('keepScreenAwake').addEventListener('change', () => {
            this.saveCurrentSettings();
        });

        document.getElementById('enableHourlyAnnouncement').addEventListener('change', () => {
            this.saveCurrentSettings();
        });

        document.getElementById('hourlyAnnouncementStart').addEventListener('change', () => {
            this.saveCurrentSettings();
        });

        document.getElementById('hourlyAnnouncementEnd').addEventListener('change', () => {
            this.saveCurrentSettings();
        });

        document.getElementById('hourlyAnnouncementFormat').addEventListener('input', () => {
            this.saveCurrentSettings();
        });

        document.getElementById('hourlyAnnouncement24Hour').addEventListener('change', () => {
            this.saveCurrentSettings();
        });

        // TTS controls
        document.getElementById('ttsRate').addEventListener('input', (e) => {
            document.getElementById('ttsRateValue').textContent = e.target.value + 'x';
            this.saveCurrentSettings();
        });

        document.getElementById('ttsPitch').addEventListener('input', (e) => {
            document.getElementById('ttsPitchValue').textContent = e.target.value + 'x';
            this.saveCurrentSettings();
        });

        document.getElementById('testTTS').addEventListener('click', () => {
            this.testTextToSpeech();
        });

        document.getElementById('testHourlyAnnouncement').addEventListener('click', () => {
            this.testHourlyAnnouncement();
        });

        // Time color management
        document.getElementById('addTimeColorBtn').addEventListener('click', () => {
            this.addTimeColorPeriod();
        });

        // Debug mode controls
        document.getElementById('applyDebugMode').addEventListener('click', () => {
            const enabled = document.getElementById('debugModeEnabled').checked;
            const speed = parseFloat(document.getElementById('debugSpeed').value) || 1;
            this.setDebugMode(enabled, speed);
            this.saveCurrentSettings();
        });

        // Background mode switching
        document.querySelectorAll('input[name="backgroundMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.settings.backgroundMode = e.target.value;
                this.saveSettings();
                this.applyBackgroundMode();
                this.updateBackground();
            });
        });

        // Location settings for sunrise/sunset
        document.getElementById('detectLocationBtn').addEventListener('click', () => {
            this.detectLocation();
        });

        document.getElementById('latitudeInput').addEventListener('change', (e) => {
            const lat = parseFloat(e.target.value);
            if (!isNaN(lat) && lat >= -90 && lat <= 90) {
                this.settings.latitude = lat;
                this.saveSettings();
                this.updateSunTimesDisplay();
                this.updateAnimatedBackground();
            }
        });

        document.getElementById('longitudeInput').addEventListener('change', (e) => {
            const lng = parseFloat(e.target.value);
            if (!isNaN(lng) && lng >= -180 && lng <= 180) {
                this.settings.longitude = lng;
                this.saveSettings();
                this.updateSunTimesDisplay();
                this.updateAnimatedBackground();
            }
        });
    }

    updateClockVisibility() {
        const digitalClock = document.getElementById('digitalClock');
        const analogClock = document.getElementById('analogClock');
        const showDigital = document.getElementById('showDigitalClock').checked;
        const showAnalog = document.getElementById('showAnalogClock').checked;

        if (showDigital) {
            digitalClock.classList.remove('hidden');
        } else {
            digitalClock.classList.add('hidden');
        }

        if (showAnalog) {
            analogClock.classList.remove('hidden');
        } else {
            analogClock.classList.add('hidden');
        }
    }

    applySavedClockType() {
        // Apply saved clock visibility settings
        document.getElementById('showDigitalClock').checked = this.settings.showDigitalClock;
        document.getElementById('showAnalogClock').checked = this.settings.showAnalogClock;
        this.updateClockVisibility();
    }

    // Modal Functions
    openModal(eventId = null) {
        // Close settings panel if open to avoid z-index conflicts
        this.closeSettings();

        this.editingEventId = eventId;
        const modal = document.getElementById('eventModal');
        const modalTitle = document.getElementById('modalTitle');

        let selectedVoice = '';

        if (eventId) {
            modalTitle.textContent = 'Edit Event';
            const event = this.events.find(e => e.id === eventId);
            if (event) {
                document.getElementById('eventTime').value = event.time;
                document.getElementById('eventName').value = event.name;

                // Load all content fields
                document.getElementById('announcementText').value = event.message || '';
                document.getElementById('pictureUrl').value = event.pictureUrl || '';
                document.getElementById('audioUrl').value = event.audioUrl || '';
                selectedVoice = event.voice || '';

                // Handle recurrence
                const recurrence = event.recurrence || { type: 'none' };
                document.getElementById('recurrenceType').value = recurrence.type;

                if (recurrence.type === 'weekly' && recurrence.days) {
                    // Set the weekday checkboxes
                    document.querySelectorAll('input[name="weekday"]').forEach(cb => {
                        cb.checked = recurrence.days.includes(parseInt(cb.value));
                    });
                } else if (recurrence.type === 'interval') {
                    document.getElementById('intervalValue').value = recurrence.intervalValue || 1;
                    document.getElementById('intervalUnit').value = recurrence.intervalUnit || 'days';
                } else if (recurrence.type === 'yearly' && recurrence.month && recurrence.day) {
                    // Format the date as YYYY-MM-DD (year doesn't matter for yearly recurrence)
                    const month = String(recurrence.month).padStart(2, '0');
                    const day = String(recurrence.day).padStart(2, '0');
                    document.getElementById('yearlyDate').value = `2000-${month}-${day}`;
                }

                this.handleRecurrenceTypeChange();
            }
        } else {
            modalTitle.textContent = 'Create New Event';
            this.resetForm();
        }

        // Populate event voice selector with the saved voice if editing
        this.loadEventVoiceSelector(selectedVoice);

        modal.classList.remove('hidden');
    }

    closeModal() {
        document.getElementById('eventModal').classList.add('hidden');
        this.editingEventId = null;
        this.resetForm();
    }

    resetForm() {
        document.getElementById('eventTime').value = '';
        document.getElementById('eventName').value = '';
        document.getElementById('announcementText').value = '';
        document.getElementById('eventVoice').value = '';
        document.getElementById('pictureUrl').value = '';
        document.getElementById('audioUrl').value = '';
        document.getElementById('pictureUpload').value = '';
        document.getElementById('audioUpload').value = '';
        document.getElementById('recurrenceType').value = 'none';
        document.getElementById('intervalValue').value = '1';
        document.getElementById('intervalUnit').value = 'days';
        document.getElementById('yearlyDate').value = '';
        // Reset weekday checkboxes
        document.querySelectorAll('input[name="weekday"]').forEach(cb => cb.checked = false);
        this.handleRecurrenceTypeChange();
    }

    // Recurrence UI handling
    handleRecurrenceTypeChange() {
        const recurrenceType = document.getElementById('recurrenceType').value;
        const weeklyOptions = document.getElementById('weeklyRecurrenceOptions');
        const yearlyOptions = document.getElementById('yearlyRecurrenceOptions');
        const intervalOptions = document.getElementById('intervalRecurrenceOptions');

        weeklyOptions.classList.add('hidden');
        yearlyOptions.classList.add('hidden');
        intervalOptions.classList.add('hidden');

        if (recurrenceType === 'weekly') {
            weeklyOptions.classList.remove('hidden');
        } else if (recurrenceType === 'yearly') {
            yearlyOptions.classList.remove('hidden');
        } else if (recurrenceType === 'interval') {
            intervalOptions.classList.remove('hidden');
        }
    }

    // Recurrence calculation methods
    shouldTriggerEvent(event, now) {
        if (!event.enabled) return false;

        const recurrence = event.recurrence || { type: 'none' };
        const eventId = event.id;
        const lastTriggered = this.eventLastTriggered[eventId] || 0;

        // Parse event time
        const [eventHour, eventMinute] = event.time.split(':').map(Number);
        const eventTime = new Date(now);
        eventTime.setHours(eventHour, eventMinute, 0, 0);

        // If event time is in the future, don't trigger
        if (eventTime > now) return false;

        // Check if enough time has passed since last trigger
        const timeSinceLastTrigger = now.getTime() - lastTriggered;

        switch (recurrence.type) {
            case 'none':
                // One-time event: trigger if never triggered before
                return lastTriggered === 0;

            case 'daily':
                // Daily: trigger if at least 24 hours have passed
                return timeSinceLastTrigger >= 24 * 60 * 60 * 1000;

            case 'weekly':
                // Weekly on specific day(s)
                if (!recurrence.days || recurrence.days.length === 0) return false;
                const currentDayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
                if (!recurrence.days.includes(currentDayOfWeek)) return false;

                // Check if at least 7 days have passed since last trigger
                return timeSinceLastTrigger >= 7 * 24 * 60 * 60 * 1000;

            case 'yearly':
                // Yearly: check if today matches the specified date and enough time has passed
                if (!recurrence.month || !recurrence.day) return false;

                const currentMonth = now.getMonth() + 1; // 1-12
                const currentDay = now.getDate();

                // Check if today is the specified date
                if (currentMonth !== recurrence.month || currentDay !== recurrence.day) {
                    return false;
                }

                // Check if at least 365 days have passed since last trigger
                return timeSinceLastTrigger >= 365 * 24 * 60 * 60 * 1000;

            case 'interval':
                // Custom interval
                const intervalValue = recurrence.intervalValue || 1;
                const intervalUnit = recurrence.intervalUnit || 'days';

                let intervalMs;
                switch (intervalUnit) {
                    case 'minutes':
                        intervalMs = intervalValue * 60 * 1000;
                        break;
                    case 'hours':
                        intervalMs = intervalValue * 60 * 60 * 1000;
                        break;
                    case 'days':
                        intervalMs = intervalValue * 24 * 60 * 60 * 1000;
                        break;
                    case 'weeks':
                        intervalMs = intervalValue * 7 * 24 * 60 * 60 * 1000;
                        break;
                    case 'years':
                        intervalMs = intervalValue * 365 * 24 * 60 * 60 * 1000;
                        break;
                    default:
                        intervalMs = 24 * 60 * 60 * 1000;
                }

                return timeSinceLastTrigger >= intervalMs;

            default:
                // Legacy repeatDaily support
                if (event.repeatDaily) {
                    return timeSinceLastTrigger >= 24 * 60 * 60 * 1000;
                }
                return lastTriggered === 0;
        }
    }

    getRecurrenceDescription(recurrence) {
        if (!recurrence || recurrence.type === 'none') {
            return 'One-time event';
        }

        switch (recurrence.type) {
            case 'daily':
                return 'Repeats daily';
            case 'weekly':
                const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                if (recurrence.days && recurrence.days.length > 0) {
                    const days = recurrence.days.map(d => dayNames[d]).join(', ');
                    return `Repeats on ${days}`;
                }
                return 'Repeats weekly';
            case 'yearly':
                const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                if (recurrence.month && recurrence.day) {
                    return `Repeats yearly on ${monthNames[recurrence.month - 1]} ${recurrence.day}`;
                }
                return 'Repeats yearly';
            case 'interval':
                const value = recurrence.intervalValue || 1;
                const unit = recurrence.intervalUnit || 'days';
                if (value === 1) {
                    return `Repeats every ${unit.slice(0, -1)}`; // Remove 's' for singular
                }
                return `Repeats every ${value} ${unit}`;
            default:
                return 'Recurring event';
        }
    }

    showEventFields(type) {
        const announcementFields = document.getElementById('announcementFields');
        const pictureFields = document.getElementById('pictureFields');
        const audioFields = document.getElementById('audioFields');

        announcementFields.classList.add('hidden');
        pictureFields.classList.add('hidden');
        audioFields.classList.add('hidden');

        switch(type) {
            case 'announcement':
                announcementFields.classList.remove('hidden');
                break;
            case 'picture':
                pictureFields.classList.remove('hidden');
                break;
            case 'audio':
                audioFields.classList.remove('hidden');
                break;
        }
    }

    handleFileUpload(event, type) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (type === 'picture') {
                    document.getElementById('pictureUrl').value = e.target.result;
                } else if (type === 'audio') {
                    document.getElementById('audioUrl').value = e.target.result;
                }
            };
            reader.readAsDataURL(file);
        }
    }

    // Event Management
    saveEvent() {
        const time = document.getElementById('eventTime').value;
        const name = document.getElementById('eventName').value;
        const message = document.getElementById('announcementText').value;
        const voice = document.getElementById('eventVoice').value;
        const pictureUrl = document.getElementById('pictureUrl').value;
        const audioUrl = document.getElementById('audioUrl').value;

        if (!time || !name) {
            alert('Please fill in the required fields: Event Name and Time');
            return;
        }

        // Build recurrence object
        const recurrenceType = document.getElementById('recurrenceType').value;
        let recurrence = { type: recurrenceType };

        if (recurrenceType === 'weekly') {
            const selectedDays = [];
            document.querySelectorAll('input[name="weekday"]:checked').forEach(cb => {
                selectedDays.push(parseInt(cb.value));
            });
            if (selectedDays.length === 0) {
                alert('Please select at least one day of the week');
                return;
            }
            recurrence.days = selectedDays;
        } else if (recurrenceType === 'yearly') {
            const yearlyDate = document.getElementById('yearlyDate').value;
            if (!yearlyDate) {
                alert('Please select a date for the yearly recurrence');
                return;
            }
            // Parse the date (format: YYYY-MM-DD)
            const dateParts = yearlyDate.split('-');
            recurrence.month = parseInt(dateParts[1]); // Month (1-12)
            recurrence.day = parseInt(dateParts[2]); // Day (1-31)
        } else if (recurrenceType === 'interval') {
            const intervalValue = parseInt(document.getElementById('intervalValue').value);
            const intervalUnit = document.getElementById('intervalUnit').value;
            if (!intervalValue || intervalValue < 1) {
                alert('Please enter a valid interval value (minimum 1)');
                return;
            }
            recurrence.intervalValue = intervalValue;
            recurrence.intervalUnit = intervalUnit;
        }

        let event;
        if (this.editingEventId) {
            // Edit existing event
            event = this.events.find(e => e.id === this.editingEventId);
            if (!event) return;

            event.time = time;
            event.name = name;
            event.recurrence = recurrence;
            event.message = message;
            event.voice = voice;
            event.pictureUrl = pictureUrl;
            event.audioUrl = audioUrl;
            event.enabled = true; // Re-enable in case it was disabled
        } else {
            // Create new event
            event = {
                id: this.getCurrentTimestamp(),
                time,
                name,
                recurrence,
                enabled: true,
                message,
                voice,
                pictureUrl,
                audioUrl
            };
            this.events.push(event);
        }

        this.saveEvents();
        this.renderEvents();
        this.closeModal();
    }

    editEvent(id) {
        this.openModal(id);
    }

    deleteEvent(id) {
        if (confirm('Are you sure you want to delete this event?')) {
            this.events = this.events.filter(e => e.id !== id);
            // Clean up last triggered time
            delete this.eventLastTriggered[id];
            this.saveEventLastTriggered();
            this.saveEvents();
            this.renderEvents();
        }
    }

    renderEvents() {
        const eventsList = document.getElementById('eventsListSettings');

        if (this.events.length === 0) {
            eventsList.innerHTML = '<p class="no-events">No events scheduled yet!</p>';
            return;
        }

        // Sort events by time
        const sortedEvents = [...this.events].sort((a, b) => {
            return a.time.localeCompare(b.time);
        });

        eventsList.innerHTML = sortedEvents.map(event => {
            // Build emoji list based on what the event has
            const emojis = [];
            if (event.message) emojis.push('📢');
            if (event.pictureUrl) emojis.push('🖼️');
            if (event.audioUrl) emojis.push('🎵');
            const emojiStr = emojis.length > 0 ? emojis.join(' ') + ' ' : '';

            const recurrenceDesc = this.getRecurrenceDescription(event.recurrence);

            return `
                <div class="event-card">
                    <div class="event-info">
                        <div class="event-time">${event.time}</div>
                        <div class="event-name">${emojiStr}${event.name}</div>
                        <div class="event-type">${recurrenceDesc}</div>
                    </div>
                    <div class="event-actions">
                        <button class="event-action-btn" onclick="app.editEvent(${event.id})" title="Edit">✏️</button>
                        <button class="event-action-btn" onclick="app.deleteEvent(${event.id})" title="Delete">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Event Checking
    startEventChecker() {
        // Use dynamic interval based on debug mode
        const interval = this.debugMode.enabled ? Math.max(100, Math.floor(1000 / this.debugMode.speed)) : 1000;
        this.checkInterval = setInterval(() => {
            this.checkEvents();
        }, interval);
    }

    checkEvents() {
        const now = this.getCurrentTime();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const currentSeconds = now.getSeconds();
        const currentMinutes = now.getMinutes();

        // Only trigger at the start of the minute (when seconds are 0)
        if (currentSeconds !== 0) {
            return;
        }

        // Check for hourly announcements (at the top of each hour)
        if (currentMinutes === 0) {
            this.checkHourlyAnnouncement(now);
        }

        this.events.forEach(event => {
            // Check if the event time matches current time AND if the event should trigger based on recurrence
            if (event.enabled && event.time === currentTime && this.shouldTriggerEvent(event, now)) {
                this.triggerEvent(event);
            }
        });
    }

    checkHourlyAnnouncement(now) {
        if (!this.settings.enableHourlyAnnouncement || !this.settings.enableTTS) {
            return;
        }

        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const startTime = this.settings.hourlyAnnouncementStart;
        const endTime = this.settings.hourlyAnnouncementEnd;

        // Check if current time is within the configured range
        if (this.isTimeInRange(currentTime, startTime, endTime)) {
            this.announceTime(now);
        }
    }

    isTimeInRange(current, start, end) {
        // Convert times to minutes for comparison
        const currentMinutes = parseInt(current.split(':')[0]) * 60 + parseInt(current.split(':')[1]);
        const startMinutes = parseInt(start.split(':')[0]) * 60 + parseInt(start.split(':')[1]);
        const endMinutes = parseInt(end.split(':')[0]) * 60 + parseInt(end.split(':')[1]);

        if (startMinutes <= endMinutes) {
            // Normal range (e.g., 08:00 to 22:00)
            return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
        } else {
            // Range crosses midnight (e.g., 22:00 to 08:00)
            return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
        }
    }

    announceTime(now) {
        const hours = now.getHours();
        const minutes = now.getMinutes();

        // Format the time string for the placeholder
        let timeString;
        if (this.settings.hourlyAnnouncement24Hour) {
            timeString = `${hours}:${minutes.toString().padStart(2, '0')}`;
        } else {
            const period = hours >= 12 ? 'PM' : 'AM';
            const displayHours = hours % 12 || 12;
            timeString = `${displayHours} ${period}`;
        }

        // Format the time announcement
        let announcement;
        if (this.settings.hourlyAnnouncementFormat && this.settings.hourlyAnnouncementFormat.includes('{time}')) {
            // Use custom format with placeholder
            announcement = this.settings.hourlyAnnouncementFormat.replace('{time}', timeString);
        } else if (this.settings.hourlyAnnouncement24Hour) {
            announcement = `It is now ${hours} hundred hours`;
        } else {
            const period = hours >= 12 ? 'PM' : 'AM';
            const displayHours = hours % 12 || 12;
            announcement = `It is now ${displayHours} ${period}`;
        }

        console.log('Hourly announcement:', announcement);

        // Play notification sound
        this.playNotificationSound();

        // Speak the time
        this.speak(announcement);
    }

    triggerEvent(event) {
        console.log('Triggering event:', event);

        // Record the last triggered time
        this.eventLastTriggered[event.id] = Date.now();
        this.saveEventLastTriggered();

        // Play a notification sound if supported
        this.playNotificationSound();

        // Show the event overlay
        this.showEventOverlay(event);

        // For one-time events, disable after triggering
        const recurrence = event.recurrence || { type: 'none' };
        if (recurrence.type === 'none') {
            event.enabled = false;
            this.saveEvents();
            this.renderEvents();
        }
    }

    playNotificationSound() {
        // Create a simple beep sound
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    }

    showEventOverlay(event) {
        const overlay = document.getElementById('eventOverlay');
        const content = document.getElementById('overlayContent');

        // Build emoji list for the title
        const emojis = [];
        if (event.message) emojis.push('📢');
        if (event.pictureUrl) emojis.push('🖼️');
        if (event.audioUrl) emojis.push('🎵');
        const emojiStr = emojis.length > 0 ? emojis.join(' ') + ' ' : '';

        let html = `<h2>${emojiStr}${event.name}</h2>`;

        // Add picture if present
        if (event.pictureUrl) {
            html += `<img src="${event.pictureUrl}" alt="${event.name}" style="max-width: 100%; border-radius: 12px; margin-top: 16px;">`;
        }

        // Add message text if present
        if (event.message) {
            html += `<p>${event.message}</p>`;
        }

        // Add audio player if present
        if (event.audioUrl) {
            html += `
                <audio controls autoplay id="eventAudio">
                    <source src="${event.audioUrl}">
                    Your browser does not support the audio element.
                </audio>
            `;
        }

        content.innerHTML = html;
        overlay.classList.remove('hidden');

        // Handle announcement + audio sequence
        if (event.message && event.audioUrl && this.settings.enableTTS) {
            // Speak announcement first, then start audio when speech ends
            const audioElement = document.getElementById('eventAudio');
            if (audioElement) {
                audioElement.pause(); // Pause autoplay initially

                const utterance = new SpeechSynthesisUtterance(event.message);
                utterance.rate = this.settings.ttsRate;
                utterance.pitch = this.settings.ttsPitch;

                const voiceToUse = event.voice || this.settings.ttsVoice;
                if (voiceToUse) {
                    const voices = window.speechSynthesis.getVoices();
                    const voice = voices.find(v => v.name === voiceToUse);
                    if (voice) {
                        utterance.voice = voice;
                    }
                }

                utterance.onend = () => {
                    // After speech ends, play the audio
                    audioElement.play().catch(e => console.log('Audio autoplay failed:', e));
                };

                utterance.onerror = () => {
                    // If speech fails, still try to play audio
                    audioElement.play().catch(e => console.log('Audio autoplay failed:', e));
                };

                window.speechSynthesis.speak(utterance);
            }
        } else if (event.message && this.settings.enableTTS) {
            // Just speak the announcement
            this.speak(event.message, event.voice);
        }
    }

    closeOverlay() {
        const overlay = document.getElementById('eventOverlay');
        overlay.classList.add('hidden');

        // Stop any playing audio
        const audio = overlay.querySelector('audio');
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }

        // Stop any text-to-speech
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
    }

    // Text-to-Speech Functions
    speak(text, eventVoice = null) {
        if (!window.speechSynthesis) {
            console.log('Text-to-speech not supported');
            return;
        }

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = this.settings.ttsRate;
        utterance.pitch = this.settings.ttsPitch;

        // Use event-specific voice if provided, otherwise use default
        const voiceToUse = eventVoice || this.settings.ttsVoice;

        // Function to set voice and speak
        const setVoiceAndSpeak = () => {
            if (voiceToUse) {
                const voices = window.speechSynthesis.getVoices();
                console.log('Available voices:', voices.length);
                console.log('Looking for voice:', voiceToUse);

                const voice = voices.find(v => v.name === voiceToUse);
                if (voice) {
                    utterance.voice = voice;
                    console.log('Using voice:', voice.name, voice.lang);
                } else {
                    console.log('Voice not found:', voiceToUse);
                    console.log('Available voice names:', voices.map(v => v.name));
                }
            } else {
                console.log('Using default system voice');
            }

            window.speechSynthesis.speak(utterance);
        };

        // Get voices and speak
        const voices = window.speechSynthesis.getVoices();

        if (voices.length > 0) {
            // Voices already loaded
            setVoiceAndSpeak();
        } else {
            // Wait for voices to load
            window.speechSynthesis.onvoiceschanged = () => {
                setVoiceAndSpeak();
                window.speechSynthesis.onvoiceschanged = null; // Clean up
            };

            // Also try after a short delay as a fallback
            setTimeout(setVoiceAndSpeak, 100);
        }
    }

    testTextToSpeech() {
        const testMessage = "Hello! This is a test of the text to speech system. Time to have fun!";

        // Get current settings from UI
        const rate = parseFloat(document.getElementById('ttsRate').value);
        const pitch = parseFloat(document.getElementById('ttsPitch').value);
        const voiceName = document.getElementById('ttsVoice').value;

        if (!window.speechSynthesis) {
            alert('Text-to-speech is not supported in your browser');
            return;
        }

        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(testMessage);
        utterance.rate = rate;
        utterance.pitch = pitch;

        if (voiceName) {
            const voices = window.speechSynthesis.getVoices();
            const voice = voices.find(v => v.name === voiceName);
            if (voice) {
                utterance.voice = voice;
            }
        }

        window.speechSynthesis.speak(utterance);
    }

    testHourlyAnnouncement() {
        const now = this.getCurrentTime();
        this.announceTime(now);
    }

    loadVoices() {
        if (!window.speechSynthesis) return;

        const populateVoices = () => {
            const voices = window.speechSynthesis.getVoices();
            const voiceSelect = document.getElementById('ttsVoice');

            if (voices.length > 0) {
                voiceSelect.innerHTML = '<option value="">Default Voice</option>';
                voices.forEach(voice => {
                    const option = document.createElement('option');
                    option.value = voice.name;
                    option.textContent = `${voice.name} (${voice.lang})`;
                    voiceSelect.appendChild(option);
                });

                // Set saved voice
                if (this.settings.ttsVoice) {
                    voiceSelect.value = this.settings.ttsVoice;
                }
            }
        };

        populateVoices();
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = populateVoices;
        }
    }

    loadEventVoiceSelector(selectedVoice = '') {
        if (!window.speechSynthesis) return;

        const populateEventVoices = () => {
            const voices = window.speechSynthesis.getVoices();
            const voiceSelect = document.getElementById('eventVoice');

            if (voices.length > 0) {
                voiceSelect.innerHTML = '<option value="">Use Default Voice</option>';
                voices.forEach(voice => {
                    const option = document.createElement('option');
                    option.value = voice.name;
                    option.textContent = `${voice.name} (${voice.lang})`;
                    voiceSelect.appendChild(option);
                });

                // Set the selected voice if provided
                if (selectedVoice) {
                    voiceSelect.value = selectedVoice;
                }
            }
        };

        // Populate immediately
        populateEventVoices();

        // Also handle async loading of voices
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = () => {
                populateEventVoices();
            };
        }
    }

    // Settings Functions
    openSettings() {
        document.getElementById('settingsPanel').classList.remove('hidden');

        // Load current settings into UI
        document.getElementById('enableTTS').checked = this.settings.enableTTS;
        document.getElementById('ttsVoice').value = this.settings.ttsVoice;
        document.getElementById('ttsRate').value = this.settings.ttsRate;
        document.getElementById('ttsPitch').value = this.settings.ttsPitch;
        document.getElementById('enable24Hour').checked = this.settings.enable24Hour;
        document.getElementById('showDigitalClock').checked = this.settings.showDigitalClock;
        document.getElementById('showAnalogClock').checked = this.settings.showAnalogClock;
        document.getElementById('showSeconds').checked = this.settings.showSeconds;
        document.getElementById('showAnalogSeconds').checked = this.settings.showAnalogSeconds;
        document.getElementById('keepScreenAwake').checked = this.settings.keepScreenAwake;
        document.getElementById('enableHourlyAnnouncement').checked = this.settings.enableHourlyAnnouncement;
        document.getElementById('hourlyAnnouncementStart').value = this.settings.hourlyAnnouncementStart;
        document.getElementById('hourlyAnnouncementEnd').value = this.settings.hourlyAnnouncementEnd;
        document.getElementById('hourlyAnnouncementFormat').value = this.settings.hourlyAnnouncementFormat || '';
        document.getElementById('hourlyAnnouncement24Hour').checked = this.settings.hourlyAnnouncement24Hour;

        // Load debug mode settings
        document.getElementById('debugModeEnabled').checked = this.settings.debugMode;
        document.getElementById('debugSpeed').value = this.settings.debugSpeed;

        document.getElementById('ttsRateValue').textContent = this.settings.ttsRate + 'x';
        document.getElementById('ttsPitchValue').textContent = this.settings.ttsPitch + 'x';

        // Set background mode
        const backgroundModeRadios = document.querySelectorAll('input[name="backgroundMode"]');
        backgroundModeRadios.forEach(radio => {
            radio.checked = (radio.value === this.settings.backgroundMode);
        });

        // Show/hide appropriate settings section
        this.applyBackgroundModeUI();

        // Render time colors
        this.renderTimeColors();

        // Render events in settings
        this.renderEvents();

        // Update location inputs and sunrise/sunset display
        this.updateLocationInputs();
        this.updateSunTimesDisplay();
    }

    closeSettings() {
        document.getElementById('settingsPanel').classList.add('hidden');
    }

    saveCurrentSettings() {
        this.settings.enableTTS = document.getElementById('enableTTS').checked;
        this.settings.ttsVoice = document.getElementById('ttsVoice').value;
        this.settings.ttsRate = parseFloat(document.getElementById('ttsRate').value);
        this.settings.ttsPitch = parseFloat(document.getElementById('ttsPitch').value);
        this.settings.enable24Hour = document.getElementById('enable24Hour').checked;
        this.settings.showDigitalClock = document.getElementById('showDigitalClock').checked;
        this.settings.showAnalogClock = document.getElementById('showAnalogClock').checked;
        this.settings.showSeconds = document.getElementById('showSeconds').checked;
        this.settings.showAnalogSeconds = document.getElementById('showAnalogSeconds').checked;
        this.settings.keepScreenAwake = document.getElementById('keepScreenAwake').checked;
        this.settings.enableHourlyAnnouncement = document.getElementById('enableHourlyAnnouncement').checked;
        this.settings.hourlyAnnouncementStart = document.getElementById('hourlyAnnouncementStart').value;
        this.settings.hourlyAnnouncementEnd = document.getElementById('hourlyAnnouncementEnd').value;
        this.settings.hourlyAnnouncementFormat = document.getElementById('hourlyAnnouncementFormat').value;
        this.settings.hourlyAnnouncement24Hour = document.getElementById('hourlyAnnouncement24Hour').checked;
        this.settings.debugMode = document.getElementById('debugModeEnabled').checked;
        this.settings.debugSpeed = parseFloat(document.getElementById('debugSpeed').value) || 1;

        this.saveSettings();
        this.updateWakeLock();
    }

    saveSettings() {
        localStorage.setItem('kidsClockSettings', JSON.stringify(this.settings));
    }

    loadSettings() {
        const stored = localStorage.getItem('kidsClockSettings');
        if (stored) {
            try {
                const loadedSettings = JSON.parse(stored);

                // Migrate old clockType setting to new format
                if (loadedSettings.clockType !== undefined &&
                    loadedSettings.showDigitalClock === undefined &&
                    loadedSettings.showAnalogClock === undefined) {
                    loadedSettings.showDigitalClock = (loadedSettings.clockType === 'digital');
                    loadedSettings.showAnalogClock = (loadedSettings.clockType === 'analog');
                    delete loadedSettings.clockType;
                }

                this.settings = { ...this.settings, ...loadedSettings };
            } catch (e) {
                console.error('Error loading settings:', e);
            }
        }
    }

    // Storage Functions
    saveEvents() {
        localStorage.setItem('kidsClockEvents', JSON.stringify(this.events));
    }

    saveEventLastTriggered() {
        localStorage.setItem('kidsClockEventLastTriggered', JSON.stringify(this.eventLastTriggered));
    }

    loadEvents() {
        const stored = localStorage.getItem('kidsClockEvents');
        if (stored) {
            try {
                this.events = JSON.parse(stored);

                // Migrate old event format (with 'type' field) to new format
                this.events = this.events.map(event => {
                    if (event.type) {
                        // Old format - convert to new format with all fields on one event
                        const migrated = {
                            id: event.id,
                            time: event.time,
                            name: event.name,
                            enabled: event.enabled !== undefined ? event.enabled : true,
                            recurrence: { type: 'none' }
                        };

                        // Copy repeatDaily if exists and convert to recurrence
                        if (event.repeatDaily !== undefined) {
                            migrated.recurrence = event.repeatDaily ? { type: 'daily' } : { type: 'none' };
                        }

                        // Copy all content fields
                        if (event.type === 'announcement') {
                            migrated.message = event.message || '';
                            migrated.voice = event.voice || '';
                        } else if (event.type === 'picture') {
                            migrated.pictureUrl = event.pictureUrl || '';
                        } else if (event.type === 'audio') {
                            migrated.audioUrl = event.audioUrl || '';
                        }

                        // If the event had the old type format, it might have only one content field
                        // But we want to support all fields on one event, so copy any that exist
                        if (event.message) migrated.message = event.message;
                        if (event.voice) migrated.voice = event.voice;
                        if (event.pictureUrl) migrated.pictureUrl = event.pictureUrl;
                        if (event.audioUrl) migrated.audioUrl = event.audioUrl;

                        delete migrated.type;
                        return migrated;
                    }

                    // Migrate old repeatDaily to new recurrence format if needed
                    if (event.repeatDaily !== undefined && !event.recurrence) {
                        event.recurrence = event.repeatDaily ? { type: 'daily' } : { type: 'none' };
                        delete event.repeatDaily;
                    }

                    // Initialize recurrence if missing
                    if (!event.recurrence) {
                        event.recurrence = { type: 'none' };
                    }

                    return event;
                });

                // Save migrated events
                this.saveEvents();
            } catch (e) {
                console.error('Error loading events:', e);
                this.events = [];
            }
        }
        // Load last triggered times
        const triggeredStored = localStorage.getItem('kidsClockEventLastTriggered');
        if (triggeredStored) {
            try {
                this.eventLastTriggered = JSON.parse(triggeredStored);
            } catch (e) {
                console.error('Error loading last triggered times:', e);
            }
        }
    }

    // Time-based Background Color Functions
    loadTimeColors() {
        const stored = localStorage.getItem('kidsClockTimeColors');
        if (stored) {
            try {
                this.timeColors = JSON.parse(stored);
                this.sortTimeColors();
            } catch (e) {
                console.error('Error loading time colors:', e);
            }
        }
    }

    saveTimeColors() {
        localStorage.setItem('kidsClockTimeColors', JSON.stringify(this.timeColors));
    }

    sortTimeColors() {
        this.timeColors.sort((a, b) => {
            const aMinutes = parseInt(a.time.split(':')[0]) * 60 + parseInt(a.time.split(':')[1]);
            const bMinutes = parseInt(b.time.split(':')[0]) * 60 + parseInt(b.time.split(':')[1]);
            return aMinutes - bMinutes;
        });
    }

    renderTimeColors() {
        const container = document.getElementById('timeColorsList');

        if (this.timeColors.length === 0) {
            container.innerHTML = '<p style="color: #999; font-style: italic;">No time periods configured. Add one to get started!</p>';
            return;
        }

        container.innerHTML = this.timeColors.map((tc, index) => `
            <div class="time-color-item">
                <div class="time-color-row">
                    <input type="time" value="${tc.time}" onblur="app.updateTimeColorAndSort(${index}, 'time', this.value)" title="Time (24h format)">
                    <input type="text" placeholder="Name" value="${tc.name || ''}" onchange="app.updateTimeColor(${index}, 'name', this.value)" style="flex: 1; padding: 8px; border: 2px solid #ddd; border-radius: 8px;">
                    <button onclick="app.removeTimeColor(${index})">✖️</button>
                </div>
                <div class="time-color-row">
                    <label style="flex: 1;">Color 1:</label>
                    <input type="color" value="${tc.color1}" onchange="app.updateTimeColor(${index}, 'color1', this.value)">
                    <label style="flex: 1; margin-left: 10px;">Color 2:</label>
                    <input type="color" value="${tc.color2}" onchange="app.updateTimeColor(${index}, 'color2', this.value)">
                </div>
                <div class="color-preview" style="background: linear-gradient(135deg, ${tc.color1}, ${tc.color2});"></div>
            </div>
        `).join('');
    }

    addTimeColorPeriod() {
        this.timeColors.push({
            time: '12:00',
            color1: '#667eea',
            color2: '#764ba2',
            name: 'New Period'
        });
        this.sortTimeColors();
        this.saveTimeColors();
        this.renderTimeColors();
    }

    updateTimeColor(index, field, value) {
        if (this.timeColors[index]) {
            this.timeColors[index][field] = value;
            this.saveTimeColors();
            this.renderTimeColors();
            this.updateBackground();
        }
    }

    updateTimeColorAndSort(index, field, value) {
        if (this.timeColors[index]) {
            this.timeColors[index][field] = value;
            if (field === 'time') {
                this.sortTimeColors();
            }
            this.saveTimeColors();
            this.renderTimeColors();
            this.updateBackground();
        }
    }

    removeTimeColor(index) {
        if (confirm('Remove this time period?')) {
            this.timeColors.splice(index, 1);
            this.saveTimeColors();
            this.renderTimeColors();
            this.updateBackground();
        }
    }

    startBackgroundUpdater() {
        // Update immediately
        this.updateBackground();

        // Use dynamic interval based on debug mode
        const interval = this.debugMode.enabled ? Math.max(100, Math.floor(60000 / this.debugMode.speed)) : 60000;
        this.backgroundInterval = setInterval(() => {
            this.updateBackground();
        }, interval);
    }

    updateBackground() {
        // Update animated backgrounds if in that mode
        this.updateAnimatedBackground();

        // For gradient mode, update the body background
        if (this.settings.backgroundMode !== 'gradient') {
            document.body.style.background = 'transparent';
            return;
        }

        const now = this.getCurrentTime();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        // Sort time colors by time
        const sorted = [...this.timeColors].sort((a, b) => {
            const aMinutes = parseInt(a.time.split(':')[0]) * 60 + parseInt(a.time.split(':')[1]);
            const bMinutes = parseInt(b.time.split(':')[0]) * 60 + parseInt(b.time.split(':')[1]);
            return aMinutes - bMinutes;
        });

        // Find current and next time periods
        let currentPeriod = sorted[sorted.length - 1]; // Default to last period
        let nextPeriod = sorted[0]; // Default to first period (next day)

        for (let i = 0; i < sorted.length; i++) {
            const periodMinutes = parseInt(sorted[i].time.split(':')[0]) * 60 + parseInt(sorted[i].time.split(':')[1]);

            if (periodMinutes <= currentMinutes) {
                currentPeriod = sorted[i];
                nextPeriod = sorted[i + 1] || sorted[0];
            }
        }

        // Calculate transition progress
        const currentMinutes_ = parseInt(currentPeriod.time.split(':')[0]) * 60 + parseInt(currentPeriod.time.split(':')[1]);
        let nextMinutes = parseInt(nextPeriod.time.split(':')[0]) * 60 + parseInt(nextPeriod.time.split(':')[1]);

        // Handle wrapping to next day
        if (nextMinutes <= currentMinutes_) {
            nextMinutes += 24 * 60;
        }

        const totalDuration = nextMinutes - currentMinutes_;
        let elapsed = currentMinutes - currentMinutes_;
        // Handle current time before first period (wrapped from previous day)
        if (elapsed < 0) {
            elapsed += 24 * 60;
        }
        const progress = Math.max(0, Math.min(1, elapsed / totalDuration));

        // Interpolate colors
        const color1 = this.interpolateColor(currentPeriod.color1, nextPeriod.color1, progress);
        const color2 = this.interpolateColor(currentPeriod.color2, nextPeriod.color2, progress);

        // Apply background
        document.body.style.background = `linear-gradient(135deg, ${color1} 0%, ${color2} 100%)`;

        // Update clock colors to match
        this.updateClockColors(color1, color2);
    }

    interpolateColor(color1, color2, progress) {
        // Convert hex to RGB
        const hex2rgb = (hex) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return [r, g, b];
        };

        const rgb2hex = (r, g, b) => {
            return '#' + [r, g, b].map(x => {
                const hex = Math.round(x).toString(16);
                return hex.length === 1 ? '0' + hex : hex;
            }).join('');
        };

        const c1 = hex2rgb(color1);
        const c2 = hex2rgb(color2);

        const r = c1[0] + (c2[0] - c1[0]) * progress;
        const g = c1[1] + (c2[1] - c1[1]) * progress;
        const b = c1[2] + (c2[2] - c1[2]) * progress;

        return rgb2hex(r, g, b);
    }

    updateClockColors(bgColor1, bgColor2) {
        // Calculate average brightness of background
        const hex2rgb = (hex) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return [r, g, b];
        };

        const rgb1 = hex2rgb(bgColor1);
        const rgb2 = hex2rgb(bgColor2);
        const avgR = (rgb1[0] + rgb2[0]) / 2;
        const avgG = (rgb1[1] + rgb2[1]) / 2;
        const avgB = (rgb1[2] + rgb2[2]) / 2;

        // Calculate relative luminance
        const luminance = (0.299 * avgR + 0.587 * avgG + 0.114 * avgB) / 255;

        // Use white for dark backgrounds, slightly lighter version for light backgrounds
        let clockColor;
        if (luminance > 0.5) {
            // Light background - use a subtle darker shade
            clockColor = `rgba(${avgR * 0.7}, ${avgG * 0.7}, ${avgB * 0.7}, 0.8)`;
        } else {
            // Dark background - use white with some transparency
            clockColor = 'rgba(255, 255, 255, 0.9)';
        }

        // Apply to digital clock
        const timeDisplay = document.querySelector('.time-display');
        const dateDisplay = document.querySelector('.date-display');
        if (timeDisplay) timeDisplay.style.color = clockColor;
        if (dateDisplay) dateDisplay.style.color = clockColor;

        // Apply to header
        const header = document.querySelector('header');
        if (header) {
            header.style.background = `linear-gradient(135deg, ${bgColor1}, ${bgColor2})`;
        }

        // Remove clock container background - make it transparent
        const clockContainer = document.querySelector('.clock-container');
        if (clockContainer) {
            clockContainer.style.background = 'transparent';
            clockContainer.style.backdropFilter = 'none';
        }
    }

    // Animated Background Functions
    generateStars() {
        const starsContainer = document.getElementById('starsContainer');
        if (!starsContainer) return;

        starsContainer.innerHTML = '';
        const numStars = 100;

        for (let i = 0; i < numStars; i++) {
            const star = document.createElement('div');
            star.className = 'star';
            star.style.left = Math.random() * 100 + '%';
            star.style.top = Math.random() * 60 + '%';
            const size = Math.random() * 3 + 1;
            star.style.width = size + 'px';
            star.style.height = size + 'px';
            star.style.animationDelay = (Math.random() * 3) + 's';
            star.style.animationDuration = ((Math.random() * 2) + 1.5) + 's';
            starsContainer.appendChild(star);
        }
    }

    randomizeCarColors() {
        // Day car colors - bright, cheerful colors
        const dayColors = [
            ['#FF6B6B', '#EE5A5A'], // Red
            ['#4ECDC4', '#3DB8B0'], // Teal
            ['#FFB347', '#FF9F1C'], // Orange
            ['#95E1D3', '#7DD3C0'], // Mint
            ['#F38181', '#E66767'], // Coral
            ['#AA96DA', '#9980CC'], // Purple
            ['#FCBAD3', '#F9A1C4'], // Pink
            ['#FFFFD2', '#FFF8B0'], // Yellow
            ['#A8E6CF', '#88D8B0'], // Sea Green
            ['#FFD93D', '#F4C430'], // Golden
        ];

        // Night car colors - darker, more subdued colors
        const nightColors = [
            ['#8B0000', '#6B0000'], // Dark Red
            ['#1a3a5a', '#0a2a4a'], // Dark Blue
            ['#4a2a6a', '#3a1a5a'], // Purple
            ['#2a4a3a', '#1a3a2a'], // Dark Green
            ['#3a3a3a', '#2a2a2a'], // Gray
            ['#4a2a2a', '#3a1a1a'], // Dark Brown
            ['#2a2a4a', '#1a1a3a'], // Dark Navy
            ['#3a3a2a', '#2a2a1a'], // Olive
            ['#4a3a2a', '#3a2a1a'], // Brown
            ['#2a3a4a', '#1a2a3a'], // Steel Blue
        ];

        // Apply colors to ALL day cars
        const dayCars = document.querySelectorAll('.day-car');
        dayCars.forEach(car => {
            const colorPair = dayColors[Math.floor(Math.random() * dayColors.length)];
            const carBody = car.querySelector('.car-body');
            const carTop = car.querySelector('.car-top');
            if (carBody) {
                carBody.style.background = `linear-gradient(180deg, ${colorPair[0]} 0%, ${colorPair[1]} 100%)`;
            }
            if (carTop) {
                carTop.style.background = `linear-gradient(180deg, ${colorPair[0]} 0%, ${colorPair[1]} 100%)`;
            }
        });

        // Apply colors to ALL night cars
        const nightCars = document.querySelectorAll('.night-car');
        nightCars.forEach(car => {
            const colorPair = nightColors[Math.floor(Math.random() * nightColors.length)];
            const carBody = car.querySelector('.car-body');
            const carTop = car.querySelector('.car-top');
            if (carBody) {
                carBody.style.background = `linear-gradient(180deg, ${colorPair[0]} 0%, ${colorPair[1]} 100%)`;
            }
            if (carTop) {
                carTop.style.background = `linear-gradient(180deg, ${colorPair[0]} 0%, ${colorPair[1]} 100%)`;
            }
        });
    }

    applyBackgroundModeUI() {
        const gradientSettings = document.getElementById('gradientBackgroundSettings');
        const animatedInfo = document.getElementById('animatedBackgroundInfo');

        if (this.settings.backgroundMode === 'animated') {
            gradientSettings.classList.add('hidden');
            animatedInfo.classList.remove('hidden');
        } else {
            gradientSettings.classList.remove('hidden');
            animatedInfo.classList.add('hidden');
        }
    }

    applyBackgroundMode() {
        const dayBackground = document.getElementById('dayBackground');
        const nightBackground = document.getElementById('nightBackground');

        this.applyBackgroundModeUI();

        if (this.settings.backgroundMode === 'animated') {
            dayBackground.classList.remove('hidden');
            nightBackground.classList.remove('hidden');
            this.updateAnimatedBackground();
        } else {
            dayBackground.classList.add('hidden');
            nightBackground.classList.add('hidden');
        }
    }

    updateAnimatedBackground() {
        if (this.settings.backgroundMode !== 'animated') return;

        const now = this.getCurrentTime();
        const dayBackground = document.getElementById('dayBackground');
        const nightBackground = document.getElementById('nightBackground');

        // Calculate sunrise/sunset times if location is available
        let isDaytime;
        if (this.settings.latitude !== null && this.settings.longitude !== null) {
            const times = SunCalc.getTimes(now, this.settings.latitude, this.settings.longitude);
            const sunrise = times.sunrise;
            const sunset = times.sunset;

            if (sunrise && sunset) {
                // Use actual sunrise/sunset times with a buffer for dawn/dusk
                // Consider it "daytime" from sunrise to sunset
                isDaytime = now >= sunrise && now < sunset;
            } else {
                // Fallback to hardcoded values if calculation fails (polar regions)
                isDaytime = now.getHours() >= 6 && now.getHours() < 19;
            }
        } else {
            // No location set, try to get it
            this.tryGetLocation();
            // Fallback to hardcoded values until location is available
            isDaytime = now.getHours() >= 6 && now.getHours() < 19;
        }

        if (isDaytime) {
            dayBackground.style.opacity = '1';
            nightBackground.style.opacity = '0';
        } else {
            dayBackground.style.opacity = '0';
            nightBackground.style.opacity = '1';
        }
    }

    // Try to get user's location using Geolocation API
    tryGetLocation() {
        if ('geolocation' in navigator && this.settings.latitude === null) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.settings.latitude = position.coords.latitude;
                    this.settings.longitude = position.coords.longitude;
                    this.saveSettings();
                },
                (error) => {
                    // Location access denied or unavailable - user will need to set manually
                    console.log('Location access not available:', error.message);
                }
            );
        }
    }

    // Detect location when user clicks the button
    detectLocation() {
        if (!('geolocation' in navigator)) {
            alert('Geolocation is not supported by your browser. Please enter your coordinates manually.');
            return;
        }

        const btn = document.getElementById('detectLocationBtn');
        btn.textContent = '🔄 Detecting...';
        btn.disabled = true;

        navigator.geolocation.getCurrentPosition(
            (position) => {
                this.settings.latitude = position.coords.latitude;
                this.settings.longitude = position.coords.longitude;
                this.saveSettings();
                this.updateLocationInputs();
                this.updateSunTimesDisplay();
                this.updateAnimatedBackground();
                btn.textContent = '📍 Auto-detect Location';
                btn.disabled = false;
            },
            (error) => {
                let errorMsg = 'Could not get your location. ';
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        errorMsg += 'Please allow location access and try again.';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMsg += 'Location information unavailable.';
                        break;
                    case error.TIMEOUT:
                        errorMsg += 'Location request timed out.';
                        break;
                    default:
                        errorMsg += 'Please enter coordinates manually.';
                }
                alert(errorMsg);
                btn.textContent = '📍 Auto-detect Location';
                btn.disabled = false;
            }
        );
    }

    // Update location input fields from settings
    updateLocationInputs() {
        const latInput = document.getElementById('latitudeInput');
        const lngInput = document.getElementById('longitudeInput');

        if (this.settings.latitude !== null) {
            latInput.value = this.settings.latitude;
        }
        if (this.settings.longitude !== null) {
            lngInput.value = this.settings.longitude;
        }
    }

    // Update the sunrise/sunset times display
    updateSunTimesDisplay() {
        const sunTimesText = document.getElementById('sunTimesText');

        if (this.settings.latitude === null || this.settings.longitude === null) {
            sunTimesText.textContent = 'Location not set. Enable location access or enter coordinates manually.';
            return;
        }

        const today = new Date();
        const times = SunCalc.getTimes(today, this.settings.latitude, this.settings.longitude);

        if (times.sunrise && times.sunset) {
            const formatTime = (date) => {
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            };
            sunTimesText.innerHTML = `🌅 Sunrise: <strong>${formatTime(times.sunrise)}</strong><br>🌇 Sunset: <strong>${formatTime(times.sunset)}</strong>`;
        } else {
            sunTimesText.textContent = 'Sunrise/sunset times not available (polar region or invalid coordinates).';
        }
    }
}

// Initialize the app
const app = new KidsClockApp();

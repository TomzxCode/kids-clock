// Kids Clock App - Main Application Logic

class KidsClockApp {
    constructor() {
        this.events = [];
        this.currentEventId = null;
        this.editingEventId = null;
        this.checkInterval = null;
        this.settings = {
            enableTTS: true,
            ttsVoice: '',
            ttsRate: 1,
            ttsPitch: 1,
            enable24Hour: false
        };
        this.init();
    }

    init() {
        this.loadEvents();
        this.loadSettings();
        this.setupEventListeners();
        this.startClock();
        this.startEventChecker();
        this.renderEvents();
        this.loadVoices();
    }

    // Clock Functions
    startClock() {
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);
    }

    updateClock() {
        const now = new Date();

        // Update digital clock
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        document.getElementById('hours').textContent = hours;
        document.getElementById('minutes').textContent = minutes;
        document.getElementById('seconds').textContent = seconds;

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

        const hourAngle = (hours * 30) + (minutes * 0.5) - 90;
        const minuteAngle = (minutes * 6) - 90;
        const secondAngle = (seconds * 6) - 90;

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
            secondHand.setAttribute('transform', `rotate(${secondAngle} 100 100)`);
        }
    }

    // Event Listeners
    setupEventListeners() {
        // Clock type toggle
        document.getElementById('digitalBtn').addEventListener('click', () => {
            this.switchClockType('digital');
        });

        document.getElementById('analogBtn').addEventListener('click', () => {
            this.switchClockType('analog');
        });

        // Modal controls
        document.getElementById('addEventBtn').addEventListener('click', () => {
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

        // Event type change
        document.getElementById('eventType').addEventListener('change', (e) => {
            this.showEventFields(e.target.value);
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

        document.getElementById('saveSettings').addEventListener('click', () => {
            this.saveSettingsData();
        });

        document.getElementById('cancelSettings').addEventListener('click', () => {
            this.closeSettings();
        });

        // TTS controls
        document.getElementById('ttsRate').addEventListener('input', (e) => {
            document.getElementById('ttsRateValue').textContent = e.target.value + 'x';
        });

        document.getElementById('ttsPitch').addEventListener('input', (e) => {
            document.getElementById('ttsPitchValue').textContent = e.target.value + 'x';
        });

        document.getElementById('testTTS').addEventListener('click', () => {
            this.testTextToSpeech();
        });
    }

    switchClockType(type) {
        const digitalClock = document.getElementById('digitalClock');
        const analogClock = document.getElementById('analogClock');
        const digitalBtn = document.getElementById('digitalBtn');
        const analogBtn = document.getElementById('analogBtn');

        if (type === 'digital') {
            digitalClock.classList.remove('hidden');
            analogClock.classList.add('hidden');
            digitalBtn.classList.add('active');
            analogBtn.classList.remove('active');
        } else {
            digitalClock.classList.add('hidden');
            analogClock.classList.remove('hidden');
            digitalBtn.classList.remove('active');
            analogBtn.classList.add('active');
        }
    }

    // Modal Functions
    openModal(eventId = null) {
        this.editingEventId = eventId;
        const modal = document.getElementById('eventModal');
        const modalTitle = document.getElementById('modalTitle');

        if (eventId) {
            modalTitle.textContent = 'Edit Event';
            const event = this.events.find(e => e.id === eventId);
            if (event) {
                document.getElementById('eventType').value = event.type;
                document.getElementById('eventTime').value = event.time;
                document.getElementById('eventName').value = event.name;
                document.getElementById('repeatDaily').checked = event.repeatDaily;

                // Load type-specific data
                if (event.type === 'announcement') {
                    document.getElementById('announcementText').value = event.message || '';
                } else if (event.type === 'picture') {
                    document.getElementById('pictureUrl').value = event.pictureUrl || '';
                } else if (event.type === 'audio') {
                    document.getElementById('audioUrl').value = event.audioUrl || '';
                }

                this.showEventFields(event.type);
            }
        } else {
            modalTitle.textContent = 'Create New Event';
            this.resetForm();
        }

        modal.classList.remove('hidden');
    }

    closeModal() {
        document.getElementById('eventModal').classList.add('hidden');
        this.editingEventId = null;
        this.resetForm();
    }

    resetForm() {
        document.getElementById('eventType').value = 'announcement';
        document.getElementById('eventTime').value = '';
        document.getElementById('eventName').value = '';
        document.getElementById('announcementText').value = '';
        document.getElementById('pictureUrl').value = '';
        document.getElementById('audioUrl').value = '';
        document.getElementById('pictureUpload').value = '';
        document.getElementById('audioUpload').value = '';
        document.getElementById('repeatDaily').checked = false;
        this.showEventFields('announcement');
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
        const type = document.getElementById('eventType').value;
        const time = document.getElementById('eventTime').value;
        const name = document.getElementById('eventName').value;
        const repeatDaily = document.getElementById('repeatDaily').checked;

        if (!time || !name) {
            alert('Please fill in the required fields: Event Name and Time');
            return;
        }

        let event;
        if (this.editingEventId) {
            // Edit existing event
            event = this.events.find(e => e.id === this.editingEventId);
            if (!event) return;

            event.type = type;
            event.time = time;
            event.name = name;
            event.repeatDaily = repeatDaily;
            event.enabled = true; // Re-enable in case it was disabled
        } else {
            // Create new event
            event = {
                id: Date.now(),
                type,
                time,
                name,
                repeatDaily,
                enabled: true
            };
            this.events.push(event);
        }

        // Add type-specific data
        switch(type) {
            case 'announcement':
                event.message = document.getElementById('announcementText').value;
                delete event.pictureUrl;
                delete event.audioUrl;
                break;
            case 'picture':
                const pictureUrl = document.getElementById('pictureUrl').value;
                if (!pictureUrl) {
                    alert('Please provide a picture URL or upload an image');
                    return;
                }
                event.pictureUrl = pictureUrl;
                delete event.message;
                delete event.audioUrl;
                break;
            case 'audio':
                const audioUrl = document.getElementById('audioUrl').value;
                if (!audioUrl) {
                    alert('Please provide an audio URL or upload an audio file');
                    return;
                }
                event.audioUrl = audioUrl;
                delete event.message;
                delete event.pictureUrl;
                break;
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
            this.saveEvents();
            this.renderEvents();
        }
    }

    renderEvents() {
        const eventsList = document.getElementById('eventsList');

        if (this.events.length === 0) {
            eventsList.innerHTML = '<p class="no-events">No events scheduled yet!</p>';
            return;
        }

        // Sort events by time
        const sortedEvents = [...this.events].sort((a, b) => {
            return a.time.localeCompare(b.time);
        });

        eventsList.innerHTML = sortedEvents.map(event => {
            const typeEmojis = {
                announcement: '📢',
                picture: '🖼️',
                audio: '🎵'
            };

            return `
                <div class="event-card">
                    <div class="event-info">
                        <div class="event-time">${event.time}</div>
                        <div class="event-name">${typeEmojis[event.type]} ${event.name}</div>
                        <div class="event-type">${event.repeatDaily ? 'Repeats daily' : 'One-time event'}</div>
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
        // Check every second
        this.checkInterval = setInterval(() => {
            this.checkEvents();
        }, 1000);
    }

    checkEvents() {
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const currentSeconds = now.getSeconds();

        // Only trigger at the start of the minute (when seconds are 0)
        if (currentSeconds !== 0) {
            return;
        }

        this.events.forEach(event => {
            if (event.enabled && event.time === currentTime) {
                this.triggerEvent(event);
            }
        });
    }

    triggerEvent(event) {
        console.log('Triggering event:', event);

        // Play a notification sound if supported
        this.playNotificationSound();

        // Show the event overlay
        this.showEventOverlay(event);

        // If it's not a repeating event, disable it
        if (!event.repeatDaily) {
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

        let html = '';

        switch(event.type) {
            case 'announcement':
                html = `
                    <div class="announcement-content">
                        <h2>📢 ${event.name}</h2>
                        <p>${event.message || ''}</p>
                    </div>
                `;
                // Speak the announcement using text-to-speech
                if (this.settings.enableTTS && event.message) {
                    this.speak(event.message);
                }
                break;
            case 'picture':
                html = `
                    <div class="picture-content">
                        <h2>🖼️ ${event.name}</h2>
                        <img src="${event.pictureUrl}" alt="${event.name}">
                    </div>
                `;
                break;
            case 'audio':
                html = `
                    <div class="audio-content">
                        <h2>🎵 ${event.name}</h2>
                        <audio controls autoplay>
                            <source src="${event.audioUrl}">
                            Your browser does not support the audio element.
                        </audio>
                    </div>
                `;
                break;
        }

        content.innerHTML = html;
        overlay.classList.remove('hidden');
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
    speak(text) {
        if (!window.speechSynthesis) {
            console.log('Text-to-speech not supported');
            return;
        }

        // Cancel any ongoing speech
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = this.settings.ttsRate;
        utterance.pitch = this.settings.ttsPitch;

        // Set voice if specified
        if (this.settings.ttsVoice) {
            const voices = window.speechSynthesis.getVoices();
            const voice = voices.find(v => v.name === this.settings.ttsVoice);
            if (voice) {
                utterance.voice = voice;
            }
        }

        window.speechSynthesis.speak(utterance);
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

    // Settings Functions
    openSettings() {
        document.getElementById('settingsPanel').classList.remove('hidden');

        // Load current settings into UI
        document.getElementById('enableTTS').checked = this.settings.enableTTS;
        document.getElementById('ttsVoice').value = this.settings.ttsVoice;
        document.getElementById('ttsRate').value = this.settings.ttsRate;
        document.getElementById('ttsPitch').value = this.settings.ttsPitch;
        document.getElementById('enable24Hour').checked = this.settings.enable24Hour;

        document.getElementById('ttsRateValue').textContent = this.settings.ttsRate + 'x';
        document.getElementById('ttsPitchValue').textContent = this.settings.ttsPitch + 'x';
    }

    closeSettings() {
        document.getElementById('settingsPanel').classList.add('hidden');
    }

    saveSettingsData() {
        this.settings.enableTTS = document.getElementById('enableTTS').checked;
        this.settings.ttsVoice = document.getElementById('ttsVoice').value;
        this.settings.ttsRate = parseFloat(document.getElementById('ttsRate').value);
        this.settings.ttsPitch = parseFloat(document.getElementById('ttsPitch').value);
        this.settings.enable24Hour = document.getElementById('enable24Hour').checked;

        this.saveSettings();
        this.closeSettings();
    }

    saveSettings() {
        localStorage.setItem('kidsClockSettings', JSON.stringify(this.settings));
    }

    loadSettings() {
        const stored = localStorage.getItem('kidsClockSettings');
        if (stored) {
            try {
                this.settings = { ...this.settings, ...JSON.parse(stored) };
            } catch (e) {
                console.error('Error loading settings:', e);
            }
        }
    }

    // Storage Functions
    saveEvents() {
        localStorage.setItem('kidsClockEvents', JSON.stringify(this.events));
    }

    loadEvents() {
        const stored = localStorage.getItem('kidsClockEvents');
        if (stored) {
            try {
                this.events = JSON.parse(stored);
            } catch (e) {
                console.error('Error loading events:', e);
                this.events = [];
            }
        }
    }
}

// Initialize the app
const app = new KidsClockApp();

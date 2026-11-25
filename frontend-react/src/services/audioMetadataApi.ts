
 // ==========================================
 // AUDIO METADATA SERVICE
 //
 // Detect audio duration on desktop,
 // Android and iPhone browsers.
 // ==========================================

 export function detectAudioDuration(
   file: File
 ): Promise<number> {
   return new Promise((resolve, reject) => {
     // ========================================
     // VALIDATE SELECTED FILE
     // ========================================

     if (!file || file.size === 0) {
       reject(
         new Error(
           "The selected audio file is empty or unavailable."
         )
       );

       return;
     }

     const audio =
       document.createElement("audio");

     const objectUrl =
       URL.createObjectURL(file);

     let finished = false;

     let attemptedDurationRecovery = false;

     // Allow additional time for slower
     // mobile devices and large audio files.

     const timeoutMs = 30000;

     // ========================================
     // FINISH AND CLEAN UP
     // ========================================

     function finish(
       error?: Error,
       duration?: number
     ) {
       if (finished) {
         return;
       }

       finished = true;

       window.clearTimeout(timer);

       audio.removeEventListener(
         "loadedmetadata",
         handleMetadata
       );

       audio.removeEventListener(
         "durationchange",
         handleDurationChange
       );

       audio.removeEventListener(
         "loadeddata",
         handleDurationChange
       );

       audio.removeEventListener(
         "timeupdate",
         handleDurationChange
       );

       audio.removeEventListener(
         "error",
         handleError
       );

       audio.pause();

       audio.removeAttribute("src");

       audio.load();

       URL.revokeObjectURL(objectUrl);

       if (error) {
         reject(error);

         return;
       }

       resolve(duration ?? 0);
     }

     // ========================================
     // CHECK DETECTED DURATION
     // ========================================

     function checkDuration(): boolean {
       if (finished) {
         return true;
       }

       const duration = audio.duration;

       if (
         Number.isFinite(duration) &&
         duration >= 1
       ) {
         finish(
           undefined,
           Math.round(duration * 100) / 100
         );

         return true;
       }

       return false;
     }

     // ========================================
     // MOBILE DURATION RECOVERY
     //
     // Some mobile browsers initially return
     // Infinity for valid audio files.
     //
     // Seeking towards the end may trigger
     // another metadata/duration update.
     // ========================================

     function recoverDuration() {
       if (
         finished ||
         attemptedDurationRecovery
       ) {
         return;
       }

       attemptedDurationRecovery = true;

       try {
         const seekable = audio.seekable;

         if (seekable.length > 0) {
           const end =
             seekable.end(
               seekable.length - 1
             );

           if (
             Number.isFinite(end) &&
             end >= 1
           ) {
             finish(
               undefined,
               Math.round(end * 100) / 100
             );

             return;
           }
         }

         // A seek can help some browsers
         // discover the actual duration.

         audio.currentTime = 1e10;

       } catch {
         // Leave the remaining metadata
         // events and timeout to handle
         // unsupported seeking.
       }
     }

     // ========================================
     // AUDIO METADATA EVENT
     // ========================================

     function handleMetadata() {
       if (checkDuration()) {
         return;
       }

       recoverDuration();
     }

     // ========================================
     // DURATION UPDATE EVENT
     // ========================================

     function handleDurationChange() {
       checkDuration();
     }

     // ========================================
     // AUDIO DECODING ERROR
     // ========================================

     function handleError() {
       finish(
         new Error(
           "Unable to read this audio file. Please check its format or encoding."
         )
       );
     }

     // ========================================
     // DETECTION TIMEOUT
     // ========================================

     const timer = window.setTimeout(
       () => {
         if (checkDuration()) {
           return;
         }

         finish(
           new Error(
             "Unable to detect the audio duration on this device. Please try a compatible MP3 or WAV file."
           )
         );
       },
       timeoutMs
     );

     // ========================================
     // REGISTER AUDIO EVENTS
     // ========================================

     audio.preload = "metadata";

     audio.addEventListener(
       "loadedmetadata",
       handleMetadata
     );

     audio.addEventListener(
       "durationchange",
       handleDurationChange
     );

     audio.addEventListener(
       "loadeddata",
       handleDurationChange
     );

     audio.addEventListener(
       "timeupdate",
       handleDurationChange
     );

     audio.addEventListener(
       "error",
       handleError
     );

     // ========================================
     // LOAD SELECTED AUDIO
     // ========================================

     audio.src = objectUrl;

     audio.load();
   });
 }

 // ==========================================
 // FORMAT AUDIO DURATION
 // ==========================================

 export function formatAudioDuration(
   duration: number
 ): string {
   if (
     !Number.isFinite(duration) ||
     duration <= 0
   ) {
     return "Not detected";
   }

   const totalSeconds =
     Math.floor(duration);

   const minutes =
     Math.floor(totalSeconds / 60);

   const seconds =
     totalSeconds % 60;

   return `${minutes}:${String(
     seconds
   ).padStart(2, "0")}`;
 }

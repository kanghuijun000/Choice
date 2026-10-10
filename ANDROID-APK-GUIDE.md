# Risk Game Android APK

This Android app opens the existing GitHub Pages Risk Game in an Android WebView. The game website and Supabase remain the source of the game and online-friend data, so the web app is not forked into a second implementation.

## Build an APK using only a phone

1. Open the repository on GitHub: https://github.com/kanghuijun000/risk-game
2. Open the **Actions** tab.
3. Select **Build Risk Game APK**.
4. Tap **Run workflow**, keep the `main` branch selected, and run it.
5. Wait for the workflow to finish successfully.
6. Open that workflow run, find **Artifacts**, and download `risk-game-debug-apk`.
7. Extract the ZIP and install `app-debug.apk` on Android. If Android asks, allow your browser or file manager to install apps from that source.

## Notes

- The APK needs an internet connection to load the game website and use Supabase online features.
- Game updates published to the GitHub Pages website appear in the app because it loads the live site.
- This workflow builds a debug APK for personal testing, not a Play Store release.
- Android may require uninstalling an older copy before installing a new APK if the signing key differs between builds.
- The APK build does not replace or modify the existing web game files.

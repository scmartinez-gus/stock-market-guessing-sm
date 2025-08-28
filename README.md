# Stock Prediction Game

A simple, static web game deployed on GitHub Pages that uses real stock market data via the Alpha Vantage API. You choose a ticker, the app picks a random recent start date (7–100 days ago on a weekday), shows the previous 7 trading days, and you predict whether the next day goes up or down. It then reveals the next day's close, updates the chart and your score, and continues until you end the game.

## Tech
- Static HTML/CSS/JS
- Charting via Chart.js (CDN)
- Data from Alpha Vantage `TIME_SERIES_DAILY_ADJUSTED`

## Local Usage
Open `index.html` in a browser. No build step required.

## Deployment to GitHub Pages
1. Create a new GitHub repository and push these files.
2. In GitHub, go to Settings → Pages.
3. Under "Build and deployment", choose "Deploy from a branch".
4. Set Branch to `main` (or your default branch) and folder to `/root`.
5. Save. Your site will be available at `https://<your-username>.github.io/<repo-name>/` once published.

## Configuration
The app uses the provided API key in `script.js` for Alpha Vantage. If you want to use your own key, edit `API_KEY` in `script.js`.

## Notes
- Alpha Vantage has per-minute and per-day rate limits. If you hit the limit, the app will show a rate limit message. Wait a minute and try again.
- The app validates ticker existence by attempting to fetch data and checking for API errors; if the ticker doesn't exist or has no data, you'll be prompted to try another ticker.
- The line chart shows closing prices only.

## License
MIT
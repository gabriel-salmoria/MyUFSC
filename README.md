# MyUFSC

> **Your Favorite Semester Planner**

Hey there! 👋 Welcome to **MyUFSC**.

I know that planning your semester at UFSC can be... chaotic. Trying to figure out which courses fit, checking prerequisites, and organizing your schedule usually involves a dozen open tabs and a mild headache.

So I built this! A hobby project designed to make you have a not-so-shitty experience.

## ✨ Features

Here's what MyUFSC can do:

- 📚 **Curriculum Understanding**: Track your mandatory and elective courses. 
- 📈 **Progress Tracking**: Visualize your completed credits and see what's left.
- 🌳 **Dependency Tree**: An interactive way to explore course prerequisites.
- 🗓️ **Weekly Schedule Builder**: Drag, drop, and construct your weekly schedule.
- 🔒 **Privacy First**: Your data is yours. I use **Client-side AES-256 encryption**, meaning your password and student data are encrypted *before* they ever leave your device. I can't see them, and neither can anyone else.
- 🤖 **Automated Data**: MyUFSC fetches course data automatically using custom scrapers (thanks to the cool [matrufsc-scraper](https://github.com/cauebs/matrufsc-scraper) project!).

## 🛠️ Tech Stack

Built with some cool tech:

- **Frontend**: [Next.js](https://nextjs.org/) & [Tailwind CSS](https://tailwindcss.com/) for a snappy UI.
- **Backend/DB**: Hosted on [Vercel](https://vercel.com/) with a [Neon](https://neon.tech/) (Postgres) database.

## 🚀 Getting Started

Want to run this locally? Awesome!

1.  **Clone the repo**
2.  **Install dependencies** (we use pnpm):
    ```bash
    pnpm install
    ```
3.  **Run the dev server**:
    ```bash
    pnpm run dev
    ```
4.  **Configuration**:
    The project uses an in-process, zero-config local database (PGlite) by default, meaning you do not need to install Postgres or run a server!
    
    If you want to use a remote Neon database instead (like in production), you can set the `DB_PROVIDER` and `NEON_URL` in your `.env`:
    ```bash
    DB_PROVIDER=neon
    NEON_URL=postgresql://user:pass@host/neondb?sslmode=require
    ```

5.  **Database Auto-Seeding**:
    When you start the server (`pnpm run dev`), if your local database is completely empty, it will automatically connect to `https://myufsc.vercel.app` to download the latest curriculum, schedules, and degrees. You don't need to manually run any setup scripts!

## 📄 License

This project is open source and licensed under the **GNU General Public License v3.0 (GPL-3.0)**.
See the [LICENSE](LICENSE) file for more details.

---
*Made with 💜 by gabsz*
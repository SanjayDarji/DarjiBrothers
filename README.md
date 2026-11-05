# Darji Brothers website

A shop website for Darji Brothers: customers browse kurtis, co-ord sets and ethnic wear, pick a colour, size and quantity, and send the order to your WhatsApp. An admin page lets you add, edit and remove products, photos, offers and contact details.

**Total running cost: ₹0.** Hosting is on GitHub Pages and the database is the free Supabase plan. You do not need to buy a domain or a database.

```
index.html        the shop
admin.html        the admin page (link at the bottom of the shop)
css/              styles
js/config.js      the only file you edit: your Supabase keys + WhatsApp number
js/               shop, admin and database code
supabase/setup.sql   run once in Supabase to create the database
.github/workflows/   keeps the free database from going to sleep
```

---

## How it works

| Part | What it does | Free limit |
|---|---|---|
| GitHub Pages | Hosts the website at `https://YOUR-USERNAME.github.io/Darji-Brothers/` | Unlimited for a site this size |
| Supabase Database | Stores products, offers and store details | 500 MB (that's tens of thousands of products) |
| Supabase Storage | Stores product photos | 1 GB. Photos are shrunk to about 150–300 KB before upload, so that's roughly 4,000–6,000 photos |
| Supabase Auth | The admin sign-in | 50,000 users |
| WhatsApp | Orders arrive as a ready-written message | Free |

Until you connect Supabase, the site runs in **demo mode** with 9 sample products. Demo mode is good for trying things out, but changes you make in the admin page are saved only in your own browser.

---

## Step 1: Put the site on GitHub Pages

1. Sign in at github.com and create a new **public** repository, for example `Darji-Brothers`.
2. Click **Add file → Upload files**, drag in **everything inside this folder** (including the `.github` folder and `.nojekyll`), and click **Commit changes**.
   - Tip: on a Mac, press Cmd+Shift+. in Finder to see hidden files like `.github` and `.nojekyll`.
3. Go to **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**, branch **main**, folder **/ (root)**, and click **Save**.
4. After a minute your shop is live at `https://YOUR-USERNAME.github.io/Darji-Brothers/`.

## Step 2: Create the free database (Supabase)

1. Go to supabase.com and sign up (you can use your GitHub account).
2. Click **New project**. Name it `darji-brothers`, set a database password (save it somewhere), choose the region **Mumbai (ap-south-1)** so the site is fast in India, and create it.
3. When it's ready, open **SQL Editor → New query**.
4. Open `supabase/setup.sql` from this folder. **Change the email on the last line** to the email you will sign in with. Paste the whole file and click **Run**. You should see "Success".

## Step 3: Create your admin login

1. In Supabase go to **Authentication → Users → Add user → Create new user**.
2. Enter the **same email** you put in `setup.sql` and a strong password. Tick **Auto Confirm User**. Click **Create user**.
3. Go to **Authentication → Sign In / Providers** (or **Providers → Email**) and turn **off** "Allow new users to sign up". Only you need an account. (The database only accepts edits from emails in the admins list, so this is a second layer of safety.)
4. Go to **Authentication → URL Configuration**. Set **Site URL** to `https://YOUR-USERNAME.github.io/Darji-Brothers/admin.html`. This makes "Forgot password?" emails open your admin page.

To add another admin later, create their user in step 3.1 and run this in the SQL Editor:

```sql
insert into public.admins (email) values ('their-email@gmail.com');
```

## Step 4: Connect the website to Supabase

1. In Supabase open **Project Settings → API** (or **Connect** at the top of the dashboard).
2. Copy the **Project URL** and the **anon public** key (newer projects call it the **publishable** key, starting with `sb_publishable_`).
3. In GitHub, open `js/config.js`, click the pencil icon, paste them in, and commit:

```js
SUPABASE_URL: "https://abcdxyz.supabase.co",
SUPABASE_KEY: "eyJhbGciOi...or sb_publishable_...",
```

These keys are safe to have in public code. Supabase is designed for this, and the security rules in `setup.sql` stop anyone except your admin email from changing anything.

Wait about a minute for GitHub Pages to update, then open the shop. The sample products will be gone and you'll see "New collection arriving soon" until you add your own.

## Step 5: Add products

1. Open `https://YOUR-USERNAME.github.io/Darji-Brothers/admin.html` (or tap **Admin** at the bottom of the shop) and sign in.
2. **Products → Add product.** Add photos (the first is the cover), a name, category, price in rupees, an optional original price (shows "% off"), colours, sizes, fabric, care and a description.
3. **Colours:** pick the shade, type a name ("Rani pink"), and link the photo that shows that colour. Customers who tap that colour then see that photo.
4. Turn off **Show on the shop** to save a product as a draft. Turn off **In stock** to show it as sold out (customers can still ask for a custom-fit one).
5. **Offer banner:** write a short offer and an end date. It shows as a pink strip with a countdown at the top of the shop and disappears when it ends.
6. **Store details:** change the WhatsApp number, Instagram, email, shop address and About us text at any time. You can also set:
   - **Opening hours.** The Contact section shows "Open now" or "Closed now" in India time.
   - **Our story.** Each chapter becomes a mark on the measuring tape in About us, and customers drag a pin along the tape to read them. The site starts with three example chapters; replace them with your real years and moments.

### The Contact section

Customers choose what they need (custom stitching, an order, an alteration or a question), type their name, city and message, and can add measurements by tapping points on a tailor's dress form. The site suggests a ready size from the chart in `js/config.js` (`SIZE_CHART`, in inches; change it to match your own sizes) and writes the full WhatsApp message for them.

> **Already ran `setup.sql` before this version?** Run it again in the SQL Editor. It safely adds the two new columns for opening hours and the story, and leaves your products alone.

---

## Keeping the free database awake

Free Supabase projects pause after about a week with no visits. The file `.github/workflows/keep-supabase-awake.yml` pings the database every 3 days so that never happens. It reads your keys from `js/config.js`, so there's nothing to set up. To check it's working, open the **Actions** tab in your GitHub repository. You may need to click **"I understand my workflows, go ahead and enable them"** once.

GitHub turns scheduled jobs off if a repository has no commits for 60 days. If you get an email about that, click the link in it to turn the job back on.

If the project ever pauses anyway, open the Supabase dashboard and click **Restore project**. Nothing is lost.

---

## Changing the look or text

- **Your logo:** put your logo file in the `images` folder (for example `images/logo.png`; a white logo on a transparent or black background works best), then set `LOGO: "images/logo.png"` in `js/config.js`. Until then the header shows a DB monogram.
- Colours and fonts: the top of `css/base.css` (off-white page, black header and footer, gold offer strip; Cormorant Garamond headings with Jost text).
- Hero title ("Tailored for You"), the three boxes under it, custom stitching steps and footer links: `index.html`.
- Sample products for demo mode: `js/sample-data.js` (not used once Supabase is connected).

## Using your own domain later (optional)

If you buy a domain like `darjibrothers.in` later, add it in GitHub **Settings → Pages → Custom domain**, then update the Site URL in Supabase step 3.4.

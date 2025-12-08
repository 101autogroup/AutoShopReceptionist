# Website Content Update Guide

This guide explains how to update the website name and other content displayed on your dashboard.

---

## Updating the Website/Brand Name

The website name appears in three locations. Open the following file to make changes:

📄 **File:** `views/layouts/main.ejs`

### Location 1: Browser Tab Title
**Line 6**
```html
<title><%= title %> | AutoShopReceptionist AI</title>
```
Change `AutoShopReceptionist AI` to your desired name.

---

### Location 2: Sidebar Logo Text
**Line 46**
```html
<h1 class="text-base font-bold text-white truncate">AutoShop AI</h1>
```
Change `AutoShop AI` to your desired name.

---

### Location 3: Mobile Header
**Line 142**
```html
<span class="font-semibold text-white text-sm">AutoShopReceptionist AI</span>
```
Change `AutoShopReceptionist AI` to your desired name.

---

## Example

If you want to change the brand name to **"AutoShopReceptionist AI"**, update the three locations as follows:

| Location | Before | After |
|----------|--------|-------|
| Line 6 | `AutoShopReceptionist AI` | `AutoShopReceptionist AI` |
| Line 46 | `AutoShop AI` | `AutoShopReceptionist AI` |
| Line 142 | `AutoShopReceptionist AI` | `AI-Telle` |

---

## After Making Changes

1. Save the file
2. Restart the server (if running locally)
3. Refresh your browser to see the changes

---

**Note:** Be careful not to modify any code between `<%= %>` or `<%- %>` tags, as these are dynamic content placeholders used by the system.

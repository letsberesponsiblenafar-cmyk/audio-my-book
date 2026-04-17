// ===============================
// AUDIO MY BOOK - FULL BACKEND
// Node.js + Express Backend
// ===============================

const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const EPub = require("epub");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});



// ===============================
// File Upload Setup
// ===============================
const upload = multer({ dest: "uploads/" });

// ===============================
// 1. Search Open Source Books
// ===============================
app.get("/api/search-books", async (req, res) => {
    try {
        const query = req.query.q;
        const response = await axios.get(
            `https://gutendex.com/books/?search=${encodeURIComponent(query)}`
        );
        res.json(response.data.results);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Book search failed" });
    }
});

// ===============================
// 2. Load Full Book Text
// ===============================
app.get("/api/load-book-text", async (req, res) => {
  try {
    let url = req.query.url;

    if (!url) {
      return res.status(400).send("No URL provided");
    }

    // Force HTTPS
    url = url.replace("http://", "https://");

    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/plain"
      },
      maxRedirects: 5,
      timeout: 15000
    });

    res.send(response.data);

  } catch (error) {
    console.error("BOOK LOAD ERROR:", error.message);
    res.status(500).send("Failed to load book");
  }
});


// ===============================
// 3. Upload PDF File
// ===============================
app.post("/api/upload-pdf", upload.single("pdf"), async (req, res) => {
    try {
        const filePath = req.file.path;
        const dataBuffer = fs.readFileSync(filePath);

        const pdfData = await pdfParse(dataBuffer);

        const pages = splitPdfPages(pdfData.text);

        fs.unlinkSync(filePath);

        res.json({
            success: true,
            totalPages: pages.length,
            pages: pages
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "PDF parsing failed" });
    }
});

// ===============================
// 4. Upload EPUB File
// ===============================
app.post("/api/upload-epub", upload.single("epub"), async (req, res) => {
    try {
        const filePath = req.file.path;
        const epub = new EPub(filePath);

        epub.on("end", function () {
            let chapters = epub.flow.map(ch => ({
                title: ch.title,
                id: ch.id
            }));

            fs.unlinkSync(filePath);

            res.json({
                success: true,
                chapters: chapters
            });
        });

        epub.parse();

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "EPUB parsing failed" });
    }
});

// ===============================
// Helper: Split Book into Pages
// ===============================
function splitIntoPages(text) {
    const pageSize = 3000;
    let pages = [];

    for (let i = 0; i < text.length; i += pageSize) {
        pages.push({
            pageNumber: pages.length + 1,
            content: text.substring(i, i + pageSize)
        });
    }

    return pages;
}

// ===============================
// Helper: Split PDF into Pages
// ===============================
function splitPdfPages(text) {
    const estimatedPages = text.split(/\n\s*\n/g);

    return estimatedPages.map((page, index) => ({
        pageNumber: index + 1,
        content: page.trim()
    }));
}

// ===============================
// 5. Get Single Page
// ===============================
app.post("/api/get-page", (req, res) => {
    const { pages, pageNumber } = req.body;

    const page = pages.find(p => p.pageNumber === pageNumber);

    if (!page) {
        return res.status(404).json({ error: "Page not found" });
    }

    res.json(page);
});

// ===============================
// Health Check
// ===============================
app.get("/health", (req, res) => {
    res.send("AUDIO MY BOOK Backend Running");
});

// ===============================
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});


app.post("/api/upload-smart-pdf", upload.single("pdf"), async (req, res) => {
    try {
        const filePath = req.file.path;
        const dataBuffer = fs.readFileSync(filePath);

        const pdfData = await pdfParse(dataBuffer);

        const pages = splitPdfIntoPages(pdfData.text);
        const contents = detectContents(pages);

        fs.unlinkSync(filePath);

        res.json({
            success: true,
            totalPages: pages.length,
            contents: contents,
            pages: pages
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Smart PDF parsing failed" });
    }
});

app.post("/api/load-section", (req, res) => {
    const { pages, startPage, endPage } = req.body;

    const selectedPages = pages.filter(
        page => page.pageNumber >= startPage && page.pageNumber <= endPage
    );

    res.json({
        success: true,
        selectedPages
    });
});

function splitPdfIntoPages(text) {
    const estimatedPages = text.split(/\n\s*\n/g);

    return estimatedPages.map((page, index) => ({
        pageNumber: index + 1,
        content: page.trim()
    }));
}

function detectContents(pages) {
    let contents = [];

    pages.forEach((page, index) => {
        const lines = page.content.split("\n");

        lines.forEach(line => {
            let cleanLine = line.trim();

            if (
                cleanLine.length > 5 &&
                cleanLine.length < 80 &&
                /^[A-Z0-9\s\-\.:]+$/i.test(cleanLine)
            ) {
                contents.push({
                    title: cleanLine,
                    startPage: index + 1
                });
            }
        });
    });

    contents = contents.filter(
        (item, index, self) =>
            index === self.findIndex(t => t.title === item.title)
    );

    for (let i = 0; i < contents.length; i++) {
        contents[i].endPage =
            i < contents.length - 1
                ? contents[i + 1].startPage - 1
                : pages.length;
    }

    return contents.slice(0, 50);
}

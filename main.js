import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import puppeteer from 'puppeteer-core'
import PCR from 'puppeteer-chromium-resolver'
const app = express()
console.log(JSON.parse(process.env.CORS))
if(JSON.parse(process.env.CORS)){
    app.use(cors())
}

app.get('/', (req, res) => {
    return res.status(200).json('good')
})

app.get('/prox', async (req, res) => {
    let browser
    let page
    try {
        if(!req.query.link){
            throw new Error('must have link query string')
        }
        browser = await puppeteer.launch({headless: true, executablePath: process.env.EXEC || puppeteer.executablePath() || (await PCR({})).executablePath});
        page = await browser.newPage();
        await page.setUserAgent(req.query.agent ? req.query.agent : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36')

        // Navigate the page to a URL.
        await page.goto(req.query.link, { waitUntil: req.query.wait ? req.query.wait.split(',').filter(Boolean) : ['load'], timeout: req.query.timeout ? Number(req.query.timeout) : 30000 })

        // Set screen size.
        // await page.setViewport({width: 1080, height: 1024});

        // await page.waitForNavigation({waitUntil: 'load'})

        // Locate the full title with a unique string.
        const pageSourceHTML = await page.content();

        await page.close()
        page = null

        await browser.close()
        browser = null

        return res.status(200).send(pageSourceHTML)
    } catch (error) {
        if(page){
            await page.close()
        }
        if(browser){
            await browser.close()
        }
        return res.status(400).send(`<html><head><title>${error.name}</title></head><body><div><p>${error.message}</p></div></body></html>`)
    }
})

app.use((req, res) => {
    return res.status(400).send(`<html><head><title>not found</title></head><body><div><p>not found</p></div></body></html>`)
})

app.listen(Number(process.env.PORT), process.env.HOST)
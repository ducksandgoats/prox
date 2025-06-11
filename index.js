import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import * as cheerio from 'cheerio'
import puppeteer from 'puppeteer-core'
import PCR from 'puppeteer-chromium-resolver'

const execuPath = process.env.EXEC || puppeteer.executablePath() || (await PCR({})).executablePath

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
        browser = await puppeteer.launch({headless: true, executablePath: execuPath});
        page = await browser.newPage();
        await page.setUserAgent(req.query.agent ? req.query.agent : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36')

        // Navigate the page to a URL.
        await page.goto(req.query.link, { waitUntil: req.query.wait ? req.query.wait.split(',').filter(Boolean) : ['load'], timeout: req.query.timeout ? Number(req.query.timeout) : 30000 })

        // Set screen size.
        // await page.setViewport({width: 1080, height: 1024});

        // await page.waitForNavigation({waitUntil: 'load'})

        // Locate the full title with a unique string.
        let pageSourceHTML = await page.content()

        await page.close()
        page = null

        await browser.close()
        browser = null
        
        if(req.query.strip && JSON.parse(req.query.strip)){
            const $ = cheerio.load(pageSourceHTML)
            $('style').remove()
            $('script').remove()
            $('*').each((i, el) => {
                if(el.attribs.href){
                    el.attribs = {href: el.attribs.href}
                } else {
                    el.attribs = {}
                }
            })
            pageSourceHTML = $.html()
        }

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
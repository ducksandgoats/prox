import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import * as cheerio from 'cheerio'
import puppeteer from 'puppeteer-core'
import PCR from 'puppeteer-chromium-resolver'
import { Feed } from "feed"

const browser = await puppeteer.launch({headless: true, executablePath: process.env.EXEC || puppeteer.executablePath() || (await PCR({})).executablePath});

async function handle(signal){
    console.log(signal)
    await browser.close()
    process.exit(0)
}

process.on('SIGINT', handle)

process.on('SIGTERM', handle)

const app = express()

if(JSON.parse(process.env.CORS)){
    app.use(cors())
}

app.get('/', (req, res) => {
    return res.status(200).json('good')
})

app.get('/feed', async (req, res) => {
    let page
    try {
        if(!req.query.link || !req.query.href || !req.query.title){
            throw new Error('must have link query string')
        }
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
        
        const $ = cheerio.load(pageSourceHTML)
        if(req.query.strip && JSON.parse(req.query.strip)){
            $('style').remove()
            $('script').remove()
            $('*').each((i, el) => {
                if(el.attribs.href){
                    el.attribs = {href: el.attribs.href}
                } else {
                    el.attribs = {}
                }
            })
            // pageSourceHTML = $.html()
        }

        const feed = new Feed({
            title: $('title').text(),
            description: $('meta[name="description"]').text() || undefined,
            id: req.query.link,
            link: req.query.link
        });

        let num = Date.now()
        $(req.query.href).each((i, e) => {
            const el = $(e)
            feed.addItem({
                link: el.attr('href'),
                title: el.find(req.query.title),
                date: new Date(num)
            })
            num = num - 86400000
        })

        res.set('Content-Type', 'application/rss+xml')
        return res.status(200).send(feed.rss2())
    } catch (error) {
        console.error(error)
        if(page){
            await page.close()
        }
        return res.status(400).send(`<html><head><title>${error.name}</title></head><body><div><p>${error.message}</p></div></body></html>`)
    }
})

app.get('/prox', async (req, res) => {
    let page
    try {
        if(!req.query.link){
            throw new Error('must have link query string')
        }
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
        console.error(error)
        if(page){
            await page.close()
        }
        return res.status(400).send(`<html><head><title>${error.name}</title></head><body><div><p>${error.message}</p></div></body></html>`)
    }
})

app.use((req, res) => {
    return res.status(400).send(`<html><head><title>not found</title></head><body><div><p>not found</p></div></body></html>`)
})

app.listen(Number(process.env.PORT), process.env.HOST)
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import * as cheerio from 'cheerio'
import puppeteer from 'puppeteer-extra'
import PCR from 'puppeteer-chromium-resolver'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import AdblockerPlugin from 'puppeteer-extra-plugin-adblocker'
import UserAgentPlugin from 'puppeteer-extra-plugin-anonymize-ua'
import RecaptchaPlugin from 'puppeteer-extra-plugin-recaptcha'
import UserAgent from 'user-agents'
import { Feed } from "feed"

puppeteer.use(StealthPlugin())
if(JSON.parse(process.env.ADBLOCK)){
    puppeteer.use(AdblockerPlugin({interceptResolutionPriority: JSON.parse(process.env.INTERCEPT) ? puppeteer.DEFAULT_INTERCEPT_RESOLUTION_PRIORITY : undefined})
)
}
if(JSON.parse(process.env.RECAPTCHA)){
    puppeteer.use(RecaptchaPlugin({provider: {id: '2captcha',token: process.env.TOKEN},visualFeedback: true}))
}
if(JSON.parse(process.env.UAGENT)){
    puppeteer.use(UserAgentPlugin({stripHeadless: JSON.parse(process.env.STRIP) || false, makeWindows: JSON.parse(process.env.WINDOWS) || false}))
}
let browser = await puppeteer.launch({headless: process.env.HEADLESS ? JSON.parse(process.env.HEADLESS) : true, args: process.env.ARGS ? process.env.ARGS.split(',').filter(Boolean) : [], executablePath: process.env.EXEC || puppeteer.executablePath() || (await PCR({})).executablePath})

async function handleDiscon(){
    console.error(`Browser disconnected, attempting to relaunch...`)
    try {
        await browser.close()
    } catch {
        console.error('Browser is already closed')
    }
    browser = await puppeteer.launch({headless: process.env.HEADLESS ? JSON.parse(process.env.HEADLESS) : true, args: process.env.ARGS ? process.env.ARGS.split(',').filter(Boolean) : [], executablePath: process.env.EXEC || puppeteer.executablePath() || (await PCR({})).executablePath})
    browser.once('disconnected', handleDiscon)
}

browser.once('disconnected', handleDiscon);

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
        if(!req.query.link || !req.query.select || !req.query.href || !req.query.title){
            throw new Error('must have link query string')
        }
        page = await browser.newPage();
        if(JSON.parse(process.env.RANDOM)){
            await page.setUserAgent(new UserAgent().toString())
        }

        // Navigate the page to a URL.
        await page.goto(req.query.link, { waitUntil: req.query.wait ? req.query.wait.split(',').filter(Boolean) : ['load'], timeout: req.query.timeout ? Number(req.query.timeout) : 30000 })

        if(req.query.delay){
            await new Promise((res) => setTimeout(res, Number(req.query.delay)))
        }

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

        const useHTML = $('title').text()

        const feed = new Feed({
            title: useHTML,
            description: $('meta[name="description"]').text() || `${req.query.link}|${useHTML}`,
            id: req.query.link,
            link: req.query.link
        });

        let num = Date.now()
        const arr = req.query.ignore ? req.query.ignore.split(',').filter(Boolean) : []
        $(req.query.select).each((i, e) => {
            const el = $(e)
            const useLink = req.query.select === req.query.href ? el.attr('href') : el.find(req.query.href).attr('href')
            const useTitle = req.query.select === req.query.title ? el.text() : el.find(req.query.title).text()
            const useDescription = req.query.select === req.query.description ? el.text() : req.query.description ? el.find(req.query.description).text() : null
            if((useLink && useTitle) && !arr.includes(useLink) && !arr.includes(useTitle)){
                feed.addItem({
                    link: useLink,
                    title: useTitle,
                    description: useDescription || `${useLink}|${useTitle}`,
                    date: new Date(num)
                })
                num = num - 86400000
            }
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

app.get('/mid', async (req, res) => {
    let page
    try {
        if(!req.query.link){
            throw new Error('must have link query string')
        }
        page = await browser.newPage();
        if(JSON.parse(process.env.RANDOM)){
            await page.setUserAgent(new UserAgent().toString())
        }

        // Navigate the page to a URL.
        const http = await page.goto(req.query.link, { waitUntil: req.query.wait ? req.query.wait.split(',').filter(Boolean) : ['load'], timeout: req.query.timeout ? Number(req.query.timeout) : 30000 })

        if(req.query.delay){
            await new Promise((res) => setTimeout(res, Number(req.query.delay)))
        }
        
        const obj = http.headers()

        if(!obj['Content-Type'] || !obj['Content-Type'].includes('xml')){
            throw new Error("does not have content type header")
        }

        if(req.query.delay){
            await new Promise((res) => setTimeout(res, Number(req.query.delay)))
        }

        // Locate the full title with a unique string.
        let pageSourceXML = await page.content()

        await page.close()
        page = null
        
        const $ = cheerio.load(pageSourceXML, {xml: true})

        res.setHeader('Content-Type', obj['Content-Type'])

        return res.status(200).send($.html())
    } catch (error) {
        console.error(error)
        if(page){
            await page.close()
        }
        return res.status(400).send(`<html><head><title>${error.name}</title></head><body><div><p>${error.message}</p></div></body></html>`)
    }
})

app.get('/relay', async (req, res) => {
    let page
    try {
        if(!req.query.link){
            throw new Error('must have link query string')
        }
        page = await browser.newPage();
        if(JSON.parse(process.env.RANDOM)){
            await page.setUserAgent(new UserAgent().toString())
        }

        // Navigate the page to a URL.
        await page.goto(req.query.link, { waitUntil: req.query.wait ? req.query.wait.split(',').filter(Boolean) : ['load'], timeout: req.query.timeout ? Number(req.query.timeout) : 30000 })

        if(req.query.delay){
            await new Promise((res) => setTimeout(res, Number(req.query.delay)))
        }

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
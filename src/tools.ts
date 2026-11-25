import { openai } from '@ai-sdk/openai'
import type { TurnClient } from '@onkeiki/channels'
import { generateText, tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { arithmetic, equityCapitalGainsTax, exitLoad, lumpsumFutureValue, sipFutureValue, TAX } from './calc.ts'
import { BROKERS, clickText, openSite, readPage, signInLink } from './desktop.ts'
import type { Store } from './store.ts'

export interface TurnTools {
  tools: ToolSet
  trusted: string[] // every tool output, for the answer checker
}

const VISION_MODEL = process.env.VISION_MODEL ?? process.env.BRAIN_MODEL ?? 'gpt-5.6-terra'
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

const holdingSchema = z.object({
  name: z.string().min(1),
  isin: z.string().regex(/^IN[A-Z0-9]{10}$/).nullish(),
  units: z.number().positive().nullish(),
  value: z.number().positive().describe('current value in ₹ as shown'),
  invested: z.number().positive().nullish().describe('cost in ₹, if shown'),
})

export function buildTools(userKey: string, store: Store, client: TurnClient): TurnTools {
  const trusted: string[] = []
  // Wrap every tool so its output is recorded and errors come back as data, never a crash.
  const t = <S extends z.ZodTypeAny>(description: string, inputSchema: S, run: (input: z.infer<S>) => unknown) =>
    tool({
      description,
      inputSchema,
      execute: async (input: z.infer<S>) => {
        let out: unknown
        try { out = await run(input) } catch (err) { out = { error: String((err as Error).message ?? err) } }
        trusted.push(JSON.stringify(out))
        return out
      },
    })

  const tools: ToolSet = {
    calc_arithmetic: t('Exact arithmetic on ₹ numbers: + - * / ( ) and %. Use for every sum, difference or percentage.',
      z.object({ expression: z.string() }), ({ expression }) => ({ expression, result: arithmetic(expression) })),
    calc_equity_tax: t('Capital gains tax on listed shares / equity mutual funds for FY 2026-27, including 4% cess. One lot per purchase.',
      z.object({
        lots: z.array(z.object({ buyDate: z.string().describe('YYYY-MM-DD'), buyValue: z.number(), sellValue: z.number() })).min(1),
        sellDate: z.string().describe('YYYY-MM-DD; use today if selling now'),
        exemptionAlreadyUsed: z.number().min(0).default(0).describe('LTCG exemption already used this financial year, ₹'),
      }), ({ lots, sellDate, exemptionAlreadyUsed }) => equityCapitalGainsTax(lots, sellDate, exemptionAlreadyUsed)),
    calc_exit_load: t('Exit load on a redemption. The load % must come from the fund or the user.',
      z.object({ amount: z.number().positive(), loadPercent: z.number().min(0).max(10) }), ({ amount, loadPercent }) => exitLoad(amount, loadPercent)),
    calc_sip: t('Future value of a monthly SIP at an ASSUMED yearly return. Always say the return is an assumption.',
      z.object({ monthly: z.number().positive(), annualRatePercent: z.number().min(0).max(30), years: z.number().positive().max(50) }),
      ({ monthly, annualRatePercent, years }) => sipFutureValue(monthly, annualRatePercent, years)),
    calc_lumpsum: t('Future value of a one-time amount at an ASSUMED yearly return.',
      z.object({ amount: z.number().positive(), annualRatePercent: z.number().min(0).max(30), years: z.number().positive().max(50) }),
      ({ amount, annualRatePercent, years }) => lumpsumFutureValue(amount, annualRatePercent, years)),
    tax_rules: t('The tax rules we use, with sources, the date we checked them and what we do not handle.', z.object({}), () => TAX),
    fund_nav: t('Latest NAV of a mutual fund from AMFI, by words in its name.', z.object({ query: z.string().min(2) }),
      ({ query }) => ({ matches: store.searchNavs(query) })),
    get_holdings: t("The user's saved holdings and total value (mutual funds revalued at the latest AMFI NAV).", z.object({}), () => {
      const holdings = store.holdings(userKey)
      return { holdings, total: Math.round(store.revalue(userKey, holdings) * 100) / 100, count: holdings.length }
    }),
    save_holdings: t('Save the holdings you read from a broker page or screenshot. Replaces earlier holdings from the same source. Only save numbers you actually saw.',
      z.object({ source: z.string().min(2).describe('e.g. groww, zerodha, screenshot'), holdings: z.array(holdingSchema).min(1).max(200) }),
      ({ source, holdings }) => { store.saveHoldings(userKey, source.toLowerCase(), holdings); return { saved: holdings.length, source } }),
    broker_sign_in: t(`Start broker sign-in: opens the login page on the user's private browser and returns a one-time link the user opens to sign in themselves. Brokers: ${Object.keys(BROKERS).join(', ')}.`,
      z.object({ broker: z.enum(Object.keys(BROKERS) as [string, ...string[]]) }), ({ broker }) => signInLink(userKey, broker)),
    broker_open: t("Open a broker page (read-only) in the user's browser and return its text.", z.object({ url: z.string().url() }), ({ url }) => openSite(userKey, url)),
    broker_read: t("Read the text of the page open in the user's browser.", z.object({}), () => readPage(userKey)),
    broker_click: t('Click a link or tab by its visible text (e.g. "Holdings"). Trading buttons are blocked.', z.object({ text: z.string().min(1).max(60) }),
      ({ text }) => clickText(userKey, text)),
    read_image: t('Read the text and numbers in an image the user sent (e.g. a holdings screenshot). Pass the attachment id.',
      z.object({ attachmentId: z.string() }), async ({ attachmentId }) => {
        const file = await client.downloadAttachment(attachmentId)
        if (!file.ok) return { error: 'could not download the image' }
        const { bytes: data, mimeType } = file.data
        if (!mimeType.startsWith('image/')) return { error: `not an image (${mimeType})` }
        if (data.byteLength > MAX_IMAGE_BYTES) return { error: 'image too large' }
        const r = await generateText({
          model: openai(VISION_MODEL),
          providerOptions: { openai: { store: false } },
          messages: [{ role: 'user', content: [
            { type: 'text', text: 'Copy every holding visible in this image, one per line, labelled exactly like: name: …; units: …; current value: …; invested: …; isin: … (leave out labels that the image does not show). Copy numbers exactly. If a value is present but you cannot read it, write UNREADABLE for that value. Do not mention columns that are not in the image. Do not guess.' },
            { type: 'file', data, mediaType: mimeType },
          ] }],
        })
        return { text: r.text }
      }),
  }
  return { tools, trusted }
}

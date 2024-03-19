import { load, CheerioAPI } from 'cheerio'

type MangaListFilterOptions = Array<{
  label: string,
  name: string | number,
  options: Array<{ label: string, value: string }>
}>

function parseIntSafe (value: string, fallback: number = 0): number {
  const parsed = parseInt(value)
  return isNaN(parsed) ? fallback : parsed
}

/**
 * This function will be invoked in manga list page.
 * The returned data will be used as the filter options for the manga list.
 */
// async function setMangaListFilterOptions () {
//   try {
//     const result: MangaListFilterOptions = []
//     // ...
//     window.Rulia.endWithResult(result)
//   } catch (error) {
//     window.Rulia.endWithResult([])
//   }
// }

async function handleMangaListSearch (page: number, keyword: string) {
  // URL: https://mto.to/search?word=<KEYWORD>&page=<PAGE>
  try {
    const result: IGetMangaListResult = {
      list: []
    }

    const rawStr = await window.Rulia.httpRequest({
      method: 'GET',
      url: `https://mto.to/search?word=${encodeURIComponent(keyword)}&page=${page}`
    })
    const $ = load(rawStr)
    const $mangaList = $('#series-list').children('.item')
    $mangaList.each((_, el) => {
      const $a = $(el).find('.item-title')
      const title = $a.text() || ''
      const url = $a.attr('href') ? `https://mto.to${$a.attr('href')}` : ''
      const $cover = $(el).find('.item-cover img')
      const coverSrc = $cover.attr('src') || ''
      result.list.push({
        title,
        url,
        coverUrl: coverSrc
      })
    })

    window.Rulia.endWithResult(result)
  } catch (error) {
    window.Rulia.endWithException((error as Error).message)
  }
}

/**
 * Get manga list for manga list page.
 * This function will be invoked by Rulia in the manga list page.
 *
 * @param {string} page Page number. Please notice this arg will be passed from Rulia in string type.
 * @param {string} pageSize Page size. Please notice this arg will be passed from Rulia in string type.
 * @param {string} keyword The search keyword. It will empty when user doesn't provide it.
 * @param {string} rawFilterOptions The filter options.
 * @returns
 */
async function getMangaList (rawPage: string, pageSize: string, keyword?: string, rawFilterOptions?: string) {
  const page = parseIntSafe(rawPage, 1)

  // If keyword is provided go for the search page.
  if (keyword) {
    await handleMangaListSearch(page, keyword)
    return
  }

  // Get manga list from https://mto.to/latest.
  // The first page is the whole HTML page, after that it reponses in JSON format that contains parital HTML codes.
  let url = 'https://mto.to/latest'
  if (page > 1) {
    url = url + '?page=' + page
  }

  try {
    const rawStr = await window.Rulia.httpRequest({
      url,
      method: 'GET'
    })

    let $: CheerioAPI
    if (page <= 1) {
      $ = load(rawStr)
    } else {
      const response = JSON.parse(rawStr) as {
        eno: number
        err: string | null
        res: {
          html: string
          more: boolean
        }
      }
      $ = load(response.res.html)
    }

    const result: IGetMangaListResult = {
      list: []
    }

    const $mangaList = $('#series-list').children('.item')
    $mangaList.each((_, el) => {
      const $a = $(el).find('.item-title')
      const title = $a.text() || ''
      const url = $a.attr('href') ? `https://mto.to${$a.attr('href')}` : ''
      const $cover = $(el).find('.item-cover img')
      const coverSrc = $cover.attr('src') || ''
      result.list.push({
        title,
        url,
        coverUrl: coverSrc
      })
    })

    window.Rulia.endWithResult(result)
  } catch (error) {
    window.Rulia.endWithException((error as Error).message)
  }
}

/**
 * Get data of a single manga.
 * This function will be invoked by Rulia when user clicks a certain manga
 * in the manga list page.
 *
 * @param {string} dataPageUrl This url is from the function "getMangaList".
 * @returns
 */
async function getMangaData (dataPageUrl: string) {
  // The url arg is something like 'https://mto.to/series/68765/goodbye-isekai-tensei'.
  try {
    const result: IGetMangaDataResult = {
      title: '',
      description: '',
      coverUrl: '',
      chapterList: []
    }

    const rawStr = await window.Rulia.httpRequest({
      method: 'GET',
      url: dataPageUrl
    })

    const $ = load(rawStr)

    const $title = $('.item-title')
    const titleText = $title.text() || ''
    result.title = titleText

    const $desc = $('#limit-height-body-summary .limit-html')
    const descText = $desc.text() || ''
    result.description = descText

    const $coverImg = $('.attr-cover').children('img')
    const coverUrl = $coverImg.attr('src') || ''
    result.coverUrl = coverUrl

    const $episodeList = $('.episode-list .main').children('.item')
    $episodeList.each((_, el) => {
      const $a = $(el).find('.chapt')
      const title = $a.text() || ''
      const url = $a.attr('href') ? `https://mto.to${$a.attr('href')}` : ''
      result.chapterList.push({
        title,
        url
      })
    })

    window.Rulia.endWithResult(result)
  } catch (error) {
    window.Rulia.endWithException((error as Error).message)
  }
}

/**
 * Get image urls of all images from a single episode.
 *
 * @param {string} chapterUrl This url is from the result of the function 'getMangaData'.
 */
async function getChapterImageList (chapterUrl: string) {
  // chapterUrl would be like: https://mto.to/chapter/1540671

  try {
    const rawStr = await window.Rulia.httpRequest({
      method: 'GET',
      url: chapterUrl
    })
    const $ = load(rawStr)

    // Find the longest (text) script element.
    const $scripts = $('script')
    let scriptText = ''
    $scripts.each((_, el) => {
      const text = $(el).text()
      if (text.length >= scriptText.length) {
        scriptText = text
      }
    })

    // 'scriptText' is a piece of JavaScript script, it has a constant
    // named 'imgHttps' and we need to get it:
    // eslint-disable-next-line no-new-func
    const func = new Function(scriptText + ';return imgHttps;')
    const imgHttps = func() as string[]

    const result: IRuliaChapterImage[] = imgHttps.map(url => ({
      url,
      width: 1,
      height: 1
    }))

    window.Rulia.endWithResult(result)
  } catch (error) {
    window.Rulia.endWithException((error as Error).message)
  }
}

/**
 * This function will be invoked when Rulia is going to download a image.
 *
 * Since some websites require special verification before downloading images,
 * you may need to implement these verification logics within this method.
 * If the target website doesn't need special logic, you can just directly
 * return the parameter 'url'.
 *
 * @param {string} path This url is from the result of the function 'getChapterImageList'
 */
async function getImageUrl (path: string) {
  return path
}
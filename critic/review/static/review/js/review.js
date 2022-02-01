const baseUrl = window.location.origin

async function getSearchItems(query) {
    const searchUrl = baseUrl + '/search_item/movie/' + query
    const response = await fetch(searchUrl)
    const data = await response.json()
    console.log('Got data from search', query, data)
    if (data["Response"] == "False") {
        console.log("Got error from search ", query, data["Error"])
        return []
    }
    return data["Search"]
}

async function getReviewItem(itemID) {
    const response = await fetch(baseUrl + '/get_item_info/movie/' + itemID)
    const data = await response.json()
    console.log('Got review details: ', data)
    return data
}

async function updateReviewItem(itemID, reviewCard) {
    const data = await getReviewItem(itemID)
    console.log('Got review item data: ', data)
    reviewCard.querySelector(".review-title").innerHTML = data["Title"] + " " + reviewCard.querySelector(".year").outerHTML
    reviewCard.querySelector("img").src = data["ImageURL"]
    reviewCard.querySelector(".year").innerText = data["Year"]
    reviewCard.querySelector(".attr1").innerText = data["Attr1"]
    reviewCard.querySelector(".description").innerText = data["Description"]
    reviewCard.querySelector(".attr2").innerText = data["Attr2"]
    reviewCard.removeAttribute("hidden")
}
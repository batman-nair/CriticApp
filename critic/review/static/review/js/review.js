const baseUrl = window.location.origin

async function getSearchItems(category, query) {
    const searchUrl = `${baseUrl}/search_item/${category}/${query}`
    const response = await fetch(searchUrl)
    const data = await response.json()
    console.log('Got data from search', query, data)
    if (data["Response"] == "False") {
        console.log("Got error from search ", query, data["Error"])
        return []
    }
    return data["Search"]
}

async function getReviewItem(category, itemID) {
    const response = await fetch(`${baseUrl}/get_item_info/${category}/${itemID}`)
    const data = await response.json()
    console.log('Got review details: ', data)
    return data
}

async function updateReviewItem(category, itemID, reviewCard) {
    const data = await getReviewItem(category, itemID)
    console.log('Got review item data: ', data)
    reviewCard.querySelector(".review-title").innerHTML = data["Title"] + " " + reviewCard.querySelector(".year").outerHTML
    if (data["ImageURL"] != "N/A") {
        reviewCard.querySelector("img").src = data["ImageURL"]
    }
    reviewCard.querySelector(".year").innerText = data["Year"]
    reviewCard.querySelector(".attr1").innerText = data["Attr1"]
    reviewCard.querySelector(".description").innerHTML = data["Description"]
    reviewCard.querySelector(".attr2").innerText = data["Attr2"]
    reviewCard.querySelector(".rating").innerText = data["Rating"]
    reviewCard.removeAttribute("hidden")
}
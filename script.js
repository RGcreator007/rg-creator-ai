document.querySelectorAll(".card").forEach(card => {

card.addEventListener("click",()=>{

const title=card.querySelector("h2").innerText;

if(title.includes("AI Chat")){

window.location.href="pages/chat.html";

}

else if(title.includes("Image")){

window.location.href="pages/image.html";

}

else if(title.includes("Content")){

window.location.href="pages/writer.html";

}

else if(title.includes("YouTube")){

window.location.href="pages/youtube.html";

}

else if(title.includes("Instagram")){

window.location.href="pages/Instagram.html";

}

else if(title.includes("Code")){

window.location.href="pages/code.html";

}

});

});
